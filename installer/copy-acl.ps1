param(
  [Parameter(Mandatory=$true, Position=0)][string]$Source,
  [Parameter(Mandatory=$true, Position=1)][string]$Target
)
$ErrorActionPreference = 'Stop'
$acl = [System.IO.File]::GetAccessControl($Source, [System.Security.AccessControl.AccessControlSections]::Access)
[System.IO.File]::SetAccessControl($Target, $acl)
