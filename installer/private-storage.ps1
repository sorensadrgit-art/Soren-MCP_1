param([Parameter(Mandatory=$true, Position=0)][string]$Directory)
$ErrorActionPreference = 'Stop'
$sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$security = New-Object System.Security.AccessControl.DirectorySecurity
$security.SetAccessRuleProtection($true, $false)
$inheritance = [System.Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit'
$propagation = [System.Security.AccessControl.PropagationFlags]::None
$allow = [System.Security.AccessControl.AccessControlType]::Allow
foreach ($identity in @($sid, (New-Object System.Security.Principal.SecurityIdentifier('S-1-5-18')))) {
  $rule = New-Object System.Security.AccessControl.FileSystemAccessRule($identity, 'FullControl', $inheritance, $propagation, $allow)
  $security.AddAccessRule($rule)
}
[System.IO.Directory]::SetAccessControl($Directory, $security)
$actual = [System.IO.Directory]::GetAccessControl($Directory, [System.Security.AccessControl.AccessControlSections]::Access)
$rules = $actual.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier])
if (!$actual.AreAccessRulesProtected -or $rules.Count -ne 2) { throw 'PRIVATE_STORAGE_PERMISSIONS_FAILED' }
foreach ($rule in $rules) {
  if ($rule.IdentityReference.Value -notin @($sid.Value, 'S-1-5-18') -or $rule.AccessControlType -ne $allow) { throw 'PRIVATE_STORAGE_PERMISSIONS_FAILED' }
}
