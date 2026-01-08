{{- define "scribe.name" -}}
{{- .Chart.Name | trunc 63 | trimSuffix "-" -}}
{{- end }}

{{- define "scribe.fullname" -}}
{{- printf "%s-%s" .Release.Name (include "scribe.name" .) | trunc 63 | trimSuffix "-" -}}
{{- end }}

{{- define "scribe.labels" -}}
app.kubernetes.io/name: {{ include "scribe.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}
