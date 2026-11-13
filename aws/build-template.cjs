const fs = require('node:fs')
const path = require('node:path')
const ref = name => ({ Ref: name })
const att = (name, attr) => ({ 'Fn::GetAtt': [name, attr] })
const sub = text => ({ 'Fn::Sub': text })
const az = index => ({ 'Fn::Select': [index, { 'Fn::GetAZs': '' }] })
const resources = {}
const add = (name, type, properties, extra = {}) => { resources[name] = { Type: type, ...extra, Properties: properties }; return ref(name) }
const secret = (name, key) => add(name, 'AWS::SecretsManager::Secret', {
  GenerateSecretString: { SecretStringTemplate: '{}', GenerateStringKey: key, PasswordLength: 48, ExcludePunctuation: true },
}, { DeletionPolicy: 'Retain', UpdateReplacePolicy: 'Retain' })

const vpc = add('Vpc', 'AWS::EC2::VPC', { CidrBlock: '10.42.0.0/16', EnableDnsSupport: true, EnableDnsHostnames: true })
const gateway = add('InternetGateway', 'AWS::EC2::InternetGateway', {})
add('GatewayAttachment', 'AWS::EC2::VPCGatewayAttachment', { VpcId: vpc, InternetGatewayId: gateway })
const publicRoutes = add('PublicRoutes', 'AWS::EC2::RouteTable', { VpcId: vpc })
add('PublicDefaultRoute', 'AWS::EC2::Route', { RouteTableId: publicRoutes, DestinationCidrBlock: '0.0.0.0/0', GatewayId: gateway }, { DependsOn: 'GatewayAttachment' })
for (const [index, suffix] of ['A', 'B'].entries()) {
  const publicSubnet = add(`Public${suffix}`, 'AWS::EC2::Subnet', { VpcId: vpc, CidrBlock: `10.42.${index}.0/24`, AvailabilityZone: az(index), MapPublicIpOnLaunch: true })
  add(`PublicRoute${suffix}`, 'AWS::EC2::SubnetRouteTableAssociation', { SubnetId: publicSubnet, RouteTableId: publicRoutes })
  add(`Private${suffix}`, 'AWS::EC2::Subnet', { VpcId: vpc, CidrBlock: `10.42.${index + 10}.0/24`, AvailabilityZone: az(index), MapPublicIpOnLaunch: false })
}
const albGroup = add('AlbGroup', 'AWS::EC2::SecurityGroup', { GroupDescription: 'Public HTTPS and HTTP redirect only', VpcId: vpc, SecurityGroupIngress: [80, 443].map(port => ({ IpProtocol: 'tcp', FromPort: port, ToPort: port, CidrIp: '0.0.0.0/0' })) })
const appGroup = add('AppGroup', 'AWS::EC2::SecurityGroup', { GroupDescription: 'Application only accepts ALB traffic; SSM administration', VpcId: vpc, SecurityGroupIngress: [{ IpProtocol: 'tcp', FromPort: 8080, ToPort: 8080, SourceSecurityGroupId: albGroup }] })
const dbGroup = add('DatabaseGroup', 'AWS::EC2::SecurityGroup', { GroupDescription: 'PostgreSQL only from app instance', VpcId: vpc, SecurityGroupIngress: [{ IpProtocol: 'tcp', FromPort: 5432, ToPort: 5432, SourceSecurityGroupId: appGroup }] })
const dbSubnets = add('DatabaseSubnets', 'AWS::RDS::DBSubnetGroup', { DBSubnetGroupDescription: 'Private DB subnets', SubnetIds: [ref('PrivateA'), ref('PrivateB')] })
const db = add('Database', 'AWS::RDS::DBInstance', {
  Engine: 'postgres', EngineLifecycleSupport: 'open-source-rds-extended-support-disabled', DBInstanceClass: ref('DatabaseClass'),
  AllocatedStorage: 20, MaxAllocatedStorage: 100, StorageType: 'gp3', StorageEncrypted: true,
  MasterUsername: 'incidencias_owner', ManageMasterUserPassword: true, DBName: 'incidencias',
  DBSubnetGroupName: dbSubnets, VPCSecurityGroups: [dbGroup], PubliclyAccessible: false,
  MultiAZ: false, BackupRetentionPeriod: 7, AutoMinorVersionUpgrade: true, DeletionProtection: true,
}, { DeletionPolicy: 'Retain', UpdateReplacePolicy: 'Retain' })
secret('AppSecret', 'DB_PASSWORD'); secret('JwtSecret', 'JWT_SECRET')
secret('AdminOneSecret', 'password'); secret('AdminTwoSecret', 'password')
const role = add('InstanceRole', 'AWS::IAM::Role', {
  AssumeRolePolicyDocument: { Version: '2012-10-17', Statement: [{ Effect: 'Allow', Principal: { Service: ['ec2.amazonaws.com'] }, Action: ['sts:AssumeRole'] }] },
  ManagedPolicyArns: [sub('arn:${AWS::Partition}:iam::aws:policy/AmazonSSMManagedInstanceCore')],
  Policies: [{ PolicyName: 'ApplicationBootstrap', PolicyDocument: { Version: '2012-10-17', Statement: [
    { Effect: 'Allow', Action: ['secretsmanager:GetSecretValue'], Resource: [ref('AppSecret'), ref('JwtSecret'), ref('AdminOneSecret'), ref('AdminTwoSecret'), att('Database', 'MasterUserSecret.SecretArn')] },
    { Effect: 'Allow', Action: ['ecr:GetAuthorizationToken'], Resource: '*' },
    { Effect: 'Allow', Action: ['ecr:BatchCheckLayerAvailability', 'ecr:GetDownloadUrlForLayer', 'ecr:BatchGetImage'], Resource: ref('EcrRepositoryArns') },
  ] } }],
})
const profile = add('InstanceProfile', 'AWS::IAM::InstanceProfile', { Roles: [role] })
const volume = add('PhotoVolume', 'AWS::EC2::Volume', { AvailabilityZone: az(0), Size: ref('PhotoDiskGiB'), VolumeType: 'gp3', Encrypted: true, Tags: [{ Key: 'Purpose', Value: 'incidencias-photos-no-automatic-backup' }] }, { DeletionPolicy: 'Retain', UpdateReplacePolicy: 'Retain' })
add('BootstrapHandle', 'AWS::CloudFormation::WaitConditionHandle', {})
const compose = fs.readFileSync(path.join(__dirname, 'compose.production.json'), 'utf8').replace(/\r\n/g, '\n')
const bootstrap = fs.readFileSync(path.join(__dirname, 'bootstrap.sh'), 'utf8').replace(/\r\n/g, '\n')
  .replace('__COMPOSE_FILE__', `cat > compose.production.json <<'COMPOSE'\n${compose}\nCOMPOSE`)
const inputs = {
  AWS_REGION: ref('AWS::Region'), PHOTO_VOLUME: volume, BACKEND_IMAGE: ref('BackendImage'), FRONTEND_IMAGE: ref('FrontendImage'),
  DB_HOST: att('Database', 'Endpoint.Address'), DOMAIN_NAME: ref('DomainName'), APP_SECRET: ref('AppSecret'), JWT_SECRET_ARN: ref('JwtSecret'),
  RDS_SECRET: att('Database', 'MasterUserSecret.SecretArn'), ADMIN_ONE_SECRET: ref('AdminOneSecret'), ADMIN_TWO_SECRET: ref('AdminTwoSecret'), SIGNAL_URL: ref('BootstrapHandle'),
}
const signal = `\nfinish() {\n code=$?\n trap - EXIT\n status=FAILURE\n [ "$code" = 0 ] && status=SUCCESS\n printf '{"Status":"%s","Reason":"Bootstrap finished; see cloud-init logs","UniqueId":"incidencias","Data":""}' "$status" | curl --silent --show-error --fail -X PUT -H 'Content-Type:' --data-binary @- "$SIGNAL_URL" || true\n exit "$code"\n}\ntrap finish EXIT\n`
const userdata = ['#!/bin/bash\nset -euo pipefail\n']
for (const [name, value] of Object.entries(inputs)) userdata.push(`export ${name}='`, value, "'\n")
userdata.push(signal, bootstrap.replace(/^#!.*\n/, ''))
const instance = add('AppInstance', 'AWS::EC2::Instance', {
  ImageId: ref('LatestAmi'), InstanceType: ref('InstanceType'), IamInstanceProfile: profile,
  SubnetId: ref('PublicA'), SecurityGroupIds: [appGroup],
  MetadataOptions: { HttpTokens: 'required', HttpPutResponseHopLimit: 1 },
  BlockDeviceMappings: [{ DeviceName: '/dev/xvda', Ebs: { VolumeSize: 20, VolumeType: 'gp3', Encrypted: true, DeleteOnTermination: true } }],
  UserData: { 'Fn::Base64': { 'Fn::Join': ['', userdata] } },
  Tags: [{ Key: 'Name', Value: sub('${AWS::StackName}-app') }],
}, { DependsOn: 'PublicDefaultRoute' })
add('PhotoAttachment', 'AWS::EC2::VolumeAttachment', { Device: '/dev/sdf', InstanceId: instance, VolumeId: volume })
add('BootstrapReady', 'AWS::CloudFormation::WaitCondition', { Handle: ref('BootstrapHandle'), Timeout: '1800', Count: 1 }, { DependsOn: 'PhotoAttachment' })
const alb = add('LoadBalancer', 'AWS::ElasticLoadBalancingV2::LoadBalancer', {
  Scheme: 'internet-facing', Type: 'application', Subnets: [ref('PublicA'), ref('PublicB')], SecurityGroups: [albGroup],
  LoadBalancerAttributes: [{ Key: 'idle_timeout.timeout_seconds', Value: '120' }, { Key: 'routing.http.drop_invalid_header_fields.enabled', Value: 'true' }],
}, { DependsOn: 'GatewayAttachment' })
const target = add('TargetGroup', 'AWS::ElasticLoadBalancingV2::TargetGroup', {
  VpcId: vpc, Protocol: 'HTTP', Port: 8080, TargetType: 'instance', Targets: [{ Id: instance, Port: 8080 }],
  HealthCheckPath: '/ready', Matcher: { HttpCode: '200' }, HealthCheckIntervalSeconds: 30, HealthyThresholdCount: 2,
  TargetGroupAttributes: [{ Key: 'deregistration_delay.timeout_seconds', Value: '40' }],
})
add('HttpsListener', 'AWS::ElasticLoadBalancingV2::Listener', {
  LoadBalancerArn: alb, Port: 443, Protocol: 'HTTPS', Certificates: [{ CertificateArn: ref('CertificateArn') }],
  SslPolicy: 'ELBSecurityPolicy-TLS13-1-2-2021-06', DefaultActions: [{ Type: 'forward', TargetGroupArn: target }],
})
add('HttpListener', 'AWS::ElasticLoadBalancingV2::Listener', {
  LoadBalancerArn: alb, Port: 80, Protocol: 'HTTP', DefaultActions: [{ Type: 'redirect', RedirectConfig: { Protocol: 'HTTPS', Port: '443', StatusCode: 'HTTP_301' } }],
})
const acl = add('WebAcl', 'AWS::WAFv2::WebACL', {
  Scope: 'REGIONAL', DefaultAction: { Allow: {} },
  VisibilityConfig: { CloudWatchMetricsEnabled: true, SampledRequestsEnabled: false, MetricName: 'IncidenciasRequests' },
  Rules: [{ Name: 'AuthRateLimit', Priority: 0, Action: { Block: {} },
    VisibilityConfig: { CloudWatchMetricsEnabled: true, SampledRequestsEnabled: false, MetricName: 'IncidenciasAuthLimit' },
    Statement: { RateBasedStatement: { Limit: 100, AggregateKeyType: 'IP', EvaluationWindowSec: 300,
      ScopeDownStatement: { OrStatement: { Statements: ['/api/auth/login', '/api/staff/auth/login', '/api/auth/register'].map(value => ({ ByteMatchStatement: { FieldToMatch: { UriPath: {} }, PositionalConstraint: 'EXACTLY', SearchString: value, TextTransformations: [{ Priority: 0, Type: 'NONE' }] } })) } },
    } },
  }, { Name: 'OverallRateLimit', Priority: 1, Action: { Block: {} },
    VisibilityConfig: { CloudWatchMetricsEnabled: true, SampledRequestsEnabled: false, MetricName: 'IncidenciasOverallLimit' },
    Statement: { RateBasedStatement: { Limit: 2000, AggregateKeyType: 'IP', EvaluationWindowSec: 300 } },
  }],
})
add('WebAclAssociation', 'AWS::WAFv2::WebACLAssociation', { ResourceArn: alb, WebACLArn: att('WebAcl', 'Arn') })
add('AppHealthAlarm', 'AWS::CloudWatch::Alarm', {
  AlarmDescription: 'ALB has an unhealthy application target; check CloudWatch and SSM', Namespace: 'AWS/ApplicationELB', MetricName: 'UnHealthyHostCount',
  Dimensions: [{ Name: 'LoadBalancer', Value: att('LoadBalancer', 'LoadBalancerFullName') }, { Name: 'TargetGroup', Value: att('TargetGroup', 'TargetGroupFullName') }],
  Statistic: 'Maximum', Period: 60, EvaluationPeriods: 3, Threshold: 1, ComparisonOperator: 'GreaterThanOrEqualToThreshold', TreatMissingData: 'breaching',
})

const template = {
  AWSTemplateFormatVersion: '2010-09-09', Description: 'Incidencias: EC2 + private RDS + HTTPS ALB + retained local photo EBS. No S3 or photo snapshots.',
  Parameters: {
    DomainName: { Type: 'String', AllowedPattern: '[a-z0-9][a-z0-9.-]+\\.[a-z]{2,}', Description: 'DNS name without scheme; certificate must cover it' },
    CertificateArn: { Type: 'String', AllowedPattern: 'arn:aws[a-z-]*:acm:[a-z0-9-]+:[0-9]{12}:certificate/[a-f0-9-]+', Description: 'Issued ACM certificate ARN in this region' },
    BackendImage: { Type: 'String', AllowedPattern: '[0-9]{12}\\.dkr\\.ecr\\.[a-z0-9-]+\\.amazonaws\\.com/[a-z0-9/_-]+@sha256:[a-f0-9]{64}' },
    FrontendImage: { Type: 'String', AllowedPattern: '[0-9]{12}\\.dkr\\.ecr\\.[a-z0-9-]+\\.amazonaws\\.com/[a-z0-9/_-]+@sha256:[a-f0-9]{64}' },
    EcrRepositoryArns: { Type: 'CommaDelimitedList', Description: 'Exactly the two ECR repository ARNs; no wildcard' },
    InstanceType: { Type: 'String', Default: 't3.small', AllowedValues: ['t3.small', 't3.medium', 't3.large'] },
    DatabaseClass: { Type: 'String', Default: 'db.t4g.small', AllowedValues: ['db.t4g.micro', 'db.t4g.small', 'db.t4g.medium'] },
    PhotoDiskGiB: { Type: 'Number', Default: 20, MinValue: 10, MaxValue: 1000 },
    LatestAmi: { Type: 'AWS::SSM::Parameter::Value<AWS::EC2::Image::Id>', Default: '/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64' },
  }, Resources: resources,
  Outputs: {
    Website: { Value: sub('https://${DomainName}') }, LoadBalancerDns: { Value: att('LoadBalancer', 'DNSName') },
    InstanceId: { Value: instance }, PhotoVolumeId: { Value: volume }, DatabaseEndpoint: { Value: att('Database', 'Endpoint.Address') },
    AdminOneSecretArn: { Value: ref('AdminOneSecret') }, AdminTwoSecretArn: { Value: ref('AdminTwoSecret') },
    RdsMasterSecretArn: { Value: att('Database', 'MasterUserSecret.SecretArn') }, AppSecretArn: { Value: ref('AppSecret') }, JwtSecretArn: { Value: ref('JwtSecret') },
  },
}
fs.writeFileSync(path.join(__dirname, 'infrastructure.json'), JSON.stringify(template, null, 2) + '\n')
console.log(`Generated infrastructure.json (${Object.keys(resources).length} resources). No AWS calls were made.`)
