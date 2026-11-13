import { createIncident } from './api/incidents'
import { uploadPhoto } from './api/photos'
import { createSubmitIncident } from './application/submitIncident'

export const submitIncident = createSubmitIncident({ createIncident, uploadPhoto })
