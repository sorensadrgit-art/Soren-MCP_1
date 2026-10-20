param(
  [Parameter(Mandatory=$true)][ValidateSet('Snapshot','Deny','Restore')][string]$Action,
  [Parameter(Mandatory=$true)][string]$Target,
  [string]$OriginalDacl
)
$ErrorActionPreference = 'Stop'
$resolved = [System.IO.Path]::GetFullPath($Target)
$temporaryRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\') + '\'
if (!$resolved.StartsWith($temporaryRoot, [System.StringComparison]::OrdinalIgnoreCase) -or
    $resolved.Substring($temporaryRoot.Length) -notmatch '^soren-installer-test-[^\\]+\\.+$' -or
    ![System.IO.Directory]::Exists($resolved)) { throw 'Fixture path required' }
$access = [System.Security.AccessControl.AccessControlSections]::Access
$acl = [System.IO.Directory]::GetAccessControl($resolved, $access)
if ($Action -eq 'Snapshot') {
  $acl.GetSecurityDescriptorSddlForm($access)
} elseif ($Action -eq 'Deny') {
  $sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
  # This noninherited rule retains reading, deletion and the owner's DACL recovery rights.
  $rights = [System.Security.AccessControl.FileSystemRights]::CreateFiles -bor [System.Security.AccessControl.FileSystemRights]::CreateDirectories
  $rule = [System.Security.AccessControl.FileSystemAccessRule]::new($sid, $rights, [System.Security.AccessControl.AccessControlType]::Deny)
  $acl.AddAccessRule($rule)
  [System.IO.Directory]::SetAccessControl($resolved, $acl)
} else {
  if ([string]::IsNullOrWhiteSpace($OriginalDacl)) { throw 'Original DACL required' }
  $acl.SetSecurityDescriptorSddlForm($OriginalDacl, $access)
  [System.IO.Directory]::SetAccessControl($resolved, $acl)
}
