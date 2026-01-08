{{- define "scribe.name" -}}
{{- .Chart.Name -}}
{{- end }}

{{- define "scribe.fullname" -}}
{{- printf "%s-%s" .Release.Name .Chart.Name -}}
{{- end }}
