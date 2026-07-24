#define AppName "Pizza and Roll - Impresión"
#define AppVersion "1.0.0"
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

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if CurPageID = PairingPage.ID then
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

    Exec(
      'powershell.exe',
      '-NoProfile -ExecutionPolicy Bypass -File "' +
        ExpandConstant('{app}\register-agent.ps1') +
        '" -InstallDirectory "' + ExpandConstant('{app}') + '"',
      ExpandConstant('{app}'),
      SW_HIDE,
      ewWaitUntilTerminated,
      TaskResult
    );
  end;
end;
