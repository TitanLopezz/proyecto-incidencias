param(
  [Parameter(Mandatory=$true)][ValidatePattern('^[a-z]{2}-[a-z]+-\d$')][string]$Region,
  [Parameter(Mandatory=$true)][ValidatePattern('^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}$')][string]$DomainName,
  [Parameter(Mandatory=$true)][string]$CertificateArn,
  [ValidatePattern('^[a-zA-Z][-a-zA-Z0-9]*$')][string]$RegistryStack = 'incidencias-registry'
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
function Invoke-Checked {
  param([string]$Command, [string[]]$Arguments)
  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$Command failed (exit $LASTEXITCODE)." }
}
Get-Command aws,docker,node -ErrorAction Stop | Out-Null
Invoke-Checked 'aws' @('sts','get-caller-identity','--region',$Region,'--query','Account','--output','text')
$certRegion = ($CertificateArn -split ':')[3]
if ($certRegion -ne $Region) { throw 'The ACM certificate must be in the deployment region.' }
$cert = Invoke-Checked 'aws' @('acm','describe-certificate','--region',$Region,'--certificate-arn',$CertificateArn,'--output','json')
$certificate = ($cert | ConvertFrom-Json).Certificate
if ($certificate.Status -ne 'ISSUED') { throw 'The ACM certificate must be ISSUED.' }
$coversDomain = $false
foreach ($san in $certificate.SubjectAlternativeNames) {
  $domainPattern = '^' + [regex]::Escape($san).Replace('\*', '[^.]+') + '$'
  if ($DomainName -match $domainPattern) { $coversDomain = $true }
}
if (-not $coversDomain) { throw 'The ACM certificate does not cover DomainName.' }
Invoke-Checked 'node' @('aws/build-template.cjs')
Invoke-Checked 'aws' @('cloudformation','validate-template','--region',$Region,'--template-body','file://aws/infrastructure.json','--query','Description','--output','text')
# Running this script explicitly creates the ECR registry stack and uploads images.
Invoke-Checked 'aws' @('cloudformation','deploy','--region',$Region,'--stack-name',$RegistryStack,'--template-file','aws/registry.json','--no-fail-on-empty-changeset')
$outputsJson = Invoke-Checked 'aws' @('cloudformation','describe-stacks','--region',$Region,'--stack-name',$RegistryStack,'--query','Stacks[0].Outputs','--output','json')
$outputs = @{}
($outputsJson | ConvertFrom-Json) | ForEach-Object { $outputs[$_.OutputKey] = $_.OutputValue }
$backendUri = $outputs['BackendUri']
$frontendUri = $outputs['FrontendUri']
$registry = ($backendUri -split '/')[0]
$loginPassword = Invoke-Checked 'aws' @('ecr','get-login-password','--region',$Region)
try {
  $loginPassword | docker login --username AWS --password-stdin $registry
  if ($LASTEXITCODE -ne 0) { throw 'ECR login failed.' }
} finally { $loginPassword = $null }
$tag = 'release-' + (Get-Date -AsUTC -Format 'yyyyMMddHHmmss')
Invoke-Checked 'docker' @('build','--platform','linux/amd64','-t',"${backendUri}:$tag",'./backend')
Invoke-Checked 'docker' @('build','--platform','linux/amd64','--build-arg','VITE_API_URL=/api','-t',"${frontendUri}:$tag",'./frontend')
Invoke-Checked 'docker' @('push',"${backendUri}:$tag")
Invoke-Checked 'docker' @('push',"${frontendUri}:$tag")
$backendName = ($backendUri -split '/',2)[1]
$frontendName = ($frontendUri -split '/',2)[1]
$backendDigest = Invoke-Checked 'aws' @('ecr','describe-images','--region',$Region,'--repository-name',$backendName,'--image-ids',"imageTag=$tag",'--query','imageDetails[0].imageDigest','--output','text')
$frontendDigest = Invoke-Checked 'aws' @('ecr','describe-images','--region',$Region,'--repository-name',$frontendName,'--image-ids',"imageTag=$tag",'--query','imageDetails[0].imageDigest','--output','text')
$parameters = @(
  @{ParameterKey='DomainName'; ParameterValue=$DomainName},
  @{ParameterKey='CertificateArn'; ParameterValue=$CertificateArn},
  @{ParameterKey='BackendImage'; ParameterValue="${backendUri}@$backendDigest"},
  @{ParameterKey='FrontendImage'; ParameterValue="${frontendUri}@$frontendDigest"},
  @{ParameterKey='EcrRepositoryArns'; ParameterValue=($outputs['BackendArn'] + ',' + $outputs['FrontendArn'])}
)
$parameters | ConvertTo-Json | Set-Content -LiteralPath aws/parameters.local.json -Encoding utf8NoBOM
Write-Host 'Images uploaded. Review aws/parameters.local.json, costs, and the infrastructure change set before executing it.'
