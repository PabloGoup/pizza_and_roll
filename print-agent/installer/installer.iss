#define AppName "Pizza and Roll - Impresión"
#define AppVersion "1.0.1"
#define AppPublisher "Pizza and Roll"
#define AppExeName "node.exe"
#ifndef SupabaseUrl
  #define SupabaseUrl "https://aefneixnrlkbhfyplkid.supabase.co"
#endif
#ifndef SupabaseAnonKey
  #define SupabaseAnonKey "sb_publishable_dET07DIxJcMCFSd6qDsPWw_JnIj8Hep"
#endif

[Setup]
AppId={{B7206F2A-54AD-48DD-9147-D8FA1EE196B7}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={autopf}\PizzaAndRoll\PrintAgent
DisableProgramGroupPage=yes
OutputDir=output
OutputBaseFilename=Pizza-and-Roll-Impresion-Setup
Compression=lzma2
SolidCompression=yes
PrivilegesRequired=admin
WizardStyle=modern
SetupIconFile=assets\logo.ico
WizardSmallImageFile=assets\logo-small.bmp
UninstallDisplayIcon={app}\logo.ico
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=no

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"

[Files]
Source: "stop-agent.ps1"; Flags: dontcopy noencryption
Source: "staging\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "assets\logo.ico"; DestDir: "{app}"; Flags: ignoreversion
Source: "register-agent.ps1"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\Guía de instalación de Pizza and Roll"; Filename: "{app}\INSTALLATION.md"
Name: "{group}\Documentación del agente de impresión"; Filename: "{app}\README.md"

[UninstallRun]
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -Command ""Unregister-ScheduledTask -TaskName 'PizzaAndRollPrintAgent' -Confirm:$false -ErrorAction SilentlyContinue"""; Flags: runhidden

[Code]
var
  PairingPage: TInputQueryWizardPage;
  AgentStopAttempted: Boolean;

procedure InitializeWizard;
begin
  PairingPage := CreateInputQueryPage(
    wpSelectDir,
    'Vincular computador',
    'Ingresa el código mostrado en la web de Pizza and Roll',
    'En la sección Impresión selecciona Agregar computador. El código dura 15 minutos.'
  );
  PairingPage.Add('Código de vinculación:', False);
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := (PageID = PairingPage.ID) and
    FileExists(ExpandConstant('{app}\.env'));
end;

function RunAgentControl(ResumeAgent: Boolean): Boolean;
var
  Arguments: String;
  ControlResult: Integer;
begin
  ExtractTemporaryFile('stop-agent.ps1');
  Arguments := '-NoProfile -ExecutionPolicy Bypass -File "' +
    ExpandConstant('{tmp}\stop-agent.ps1') +
    '" -InstallDirectory "' + ExpandConstant('{app}') + '"';
  if ResumeAgent then
    Arguments := Arguments + ' -Resume';
  Result := Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
    Arguments, ExpandConstant('{tmp}'), SW_HIDE, ewWaitUntilTerminated, ControlResult);
  if Result then
    Result := ControlResult = 0;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  Result := '';
  AgentStopAttempted := True;
  if not RunAgentControl(False) then
    Result := 'No se pudo detener el agente anterior o liberar sus archivos. ' +
      'Cierra el instalador y reinicia el computador antes de volver a instalar.';
end;

procedure DeinitializeSetup;
begin
  if AgentStopAttempted then
  begin
    if not RunAgentControl(True) then
      Log('No se pudo reanudar la tarea del agente al cerrar el instalador.');
  end;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if (CurPageID = PairingPage.ID) and not
    FileExists(ExpandConstant('{app}\.env')) then
  begin
    PairingPage.Values[0] := Uppercase(Trim(PairingPage.Values[0]));
    if Length(PairingPage.Values[0]) <> 8 then
    begin
      MsgBox('El código debe tener 8 caracteres.', mbError, MB_OK);
      Result := False;
    end;
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  PairResult: Integer;
  TaskResult: Integer;
  PairArguments: String;
begin
  if CurStep = ssPostInstall then
  begin
    if not FileExists(ExpandConstant('{app}\.env')) then
    begin
      PairArguments :=
        '"' + ExpandConstant('{app}\pair-agent.mjs') + '" ' +
        PairingPage.Values[0] + ' ' +
        '{#SupabaseUrl}' + ' ' +
        '{#SupabaseAnonKey}' + ' ' +
        '"' + ExpandConstant('{app}') + '"';

      if not Exec(
        ExpandConstant('{app}\node.exe'),
        PairArguments,
        ExpandConstant('{app}'),
        SW_HIDE,
        ewWaitUntilTerminated,
        PairResult
      ) or (PairResult <> 0) then
      begin
        MsgBox(
          'No se pudo vincular el computador. Verifica el código y vuelve a ejecutar el instalador.',
          mbError,
          MB_OK
        );
        Exit;
      end;
    end;

    if not Exec(
      ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
      '-NoProfile -ExecutionPolicy Bypass -File "' +
        ExpandConstant('{app}\register-agent.ps1') +
        '" -InstallDirectory "' + ExpandConstant('{app}') + '"',
      ExpandConstant('{app}'),
      SW_HIDE,
      ewWaitUntilTerminated,
      TaskResult
    ) or (TaskResult <> 0) then
    begin
      MsgBox('Los archivos se actualizaron, pero no se pudo iniciar el agente. ' +
        'Reinicia el computador y revisa su estado en Impresion.', mbError, MB_OK);
    end;
  end;
end;
