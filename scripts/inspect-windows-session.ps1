$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public class CompanionSession {
 [DllImport("kernel32.dll")] public static extern uint WTSGetActiveConsoleSessionId();
 [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
 [DllImport("user32.dll")] public static extern IntPtr GetThreadDesktop(uint id);
 [DllImport("user32.dll")] public static extern IntPtr GetProcessWindowStation();
 [DllImport("user32.dll")] public static extern IntPtr OpenInputDesktop(uint flags,bool inherit,uint access);
 [DllImport("user32.dll")] public static extern bool CloseDesktop(IntPtr desktop);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern bool GetUserObjectInformation(IntPtr handle,int index,StringBuilder name,uint length,out uint needed);
 public static string Name(IntPtr handle){var b=new StringBuilder(256);uint needed;if(handle==IntPtr.Zero||!GetUserObjectInformation(handle,2,b,512,out needed))return "unavailable";return b.ToString();}
}
'@
$inputDesktop = [CompanionSession]::OpenInputDesktop(0,$false,1)
try {
 $result = @{ sessionId=(Get-Process -Id $PID).SessionId; consoleSession=[CompanionSession]::WTSGetActiveConsoleSessionId(); windowStation=[CompanionSession]::Name([CompanionSession]::GetProcessWindowStation()); threadDesktop=[CompanionSession]::Name([CompanionSession]::GetThreadDesktop([CompanionSession]::GetCurrentThreadId())); inputDesktop=[CompanionSession]::Name($inputDesktop) }
 New-Item -ItemType Directory -Force .validation | Out-Null
 $result | ConvertTo-Json | Tee-Object -FilePath .validation/windows-session.json
} finally { if($inputDesktop -ne [IntPtr]::Zero){[CompanionSession]::CloseDesktop($inputDesktop)|Out-Null} }
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$desktop = [System.Windows.Automation.AutomationElement]::RootElement
$windows = $desktop.FindAll([System.Windows.Automation.TreeScope]::Children,[System.Windows.Automation.Condition]::TrueCondition)
$observed = @()
foreach($window in $windows) {
 if($window.Current.Name -notmatch 'privacy|Windows|Microsoft') { continue }
 $controls=$window.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition)
 $rows=@($controls | ForEach-Object { if($_.Current.Name) { @{name=$_.Current.Name;type=$_.Current.ControlType.ProgrammaticName;id=$_.Current.AutomationId;enabled=$_.Current.IsEnabled;offscreen=$_.Current.IsOffscreen} } })
 $observed+=@{name=$window.Current.Name;processId=$window.Current.ProcessId;controls=$rows}
}
$observed | ConvertTo-Json -Depth 5 | Tee-Object -FilePath .validation/windows-initial-desktop.json
