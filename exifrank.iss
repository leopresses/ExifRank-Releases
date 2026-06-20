[Setup]
AppId={{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}
AppName=ExifRank
AppVersion=2.0.0
AppPublisher=Léo Presses
AppPublisherURL=https://exifrank.app
AppSupportURL=https://exifrank.app
AppUpdatesURL=https://exifrank.app
DefaultDirName={autopf}\ExifRank
UsePreviousAppDir=no
DisableProgramGroupPage=yes
; Disable the "Select Start Menu Folder" wizard page
OutputDir=.\dist
OutputBaseFilename=ExifRank_Installer
SetupIconFile=icone.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
WizardSmallImageFile=wizard_small.bmp
WizardImageFile=wizard_large.bmp
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64
PrivilegesRequired=admin
CloseApplications=yes

[Languages]
Name: "brazilianportuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
; A pasta dist\ExifRank será gerada pelo PyInstaller no modo OneDir
Source: "dist\ExifRank\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\ExifRank"; Filename: "{app}\ExifRank.exe"
Name: "{autodesktop}\ExifRank"; Filename: "{app}\ExifRank.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\ExifRank.exe"; Description: "{cm:LaunchProgram,ExifRank}"; Flags: nowait postinstall skipifsilent

[InstallDelete]
; Cleanup older installations if needed
Type: filesandordirs; Name: "{app}\_MEI*"

[Code]
// Desinstala automaticamente a versão antiga do GeoRanker (se existir)
// antes de instalar o ExifRank na pasta nova.
function InitializeSetup(): Boolean;
var
  UninstallString: String;
  ResultCode: Integer;
  OldDir: String;
begin
  Result := True;

  // Verifica se existe o uninstaller do GeoRanker na pasta antiga
  OldDir := ExpandConstant('{autopf}\GeoRanker');
  if DirExists(OldDir) then
  begin
    // Tenta encontrar o uninstaller pelo registro (mesmo AppId)
    if RegQueryStringValue(HKLM, 'SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}_is1',
      'UninstallString', UninstallString) then
    begin
      // Executa o desinstalador silenciosamente
      Exec(RemoveQuotes(UninstallString), '/VERYSILENT /SUPPRESSMSGBOXES /NORESTART', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    end
    else if RegQueryStringValue(HKCU, 'SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}_is1',
      'UninstallString', UninstallString) then
    begin
      Exec(RemoveQuotes(UninstallString), '/VERYSILENT /SUPPRESSMSGBOXES /NORESTART', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    end;
  end;
end;

// Remove a pasta antiga do GeoRanker após instalação, se ainda existir
procedure CurStepChanged(CurStep: TSetupStep);
var
  OldDir: String;
begin
  if CurStep = ssPostInstall then
  begin
    OldDir := ExpandConstant('{autopf}\GeoRanker');
    if DirExists(OldDir) then
    begin
      DelTree(OldDir, True, True, True);
    end;
  end;
end;
