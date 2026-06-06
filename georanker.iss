[Setup]
AppId={{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}
AppName=GeoRanker
AppVersion=1.0.10
AppPublisher=Léo Presses
AppPublisherURL=https://georanker.app
AppSupportURL=https://georanker.app
AppUpdatesURL=https://georanker.app
DefaultDirName={autopf}\GeoRanker
DisableProgramGroupPage=yes
; Disable the "Select Start Menu Folder" wizard page
OutputDir=.\dist
OutputBaseFilename=GeoRanker_Installer
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
; A pasta dist\GeoRanker será gerada pelo PyInstaller no modo OneDir
Source: "dist\GeoRanker\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\GeoRanker"; Filename: "{app}\GeoRanker.exe"
Name: "{autodesktop}\GeoRanker"; Filename: "{app}\GeoRanker.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\GeoRanker.exe"; Description: "{cm:LaunchProgram,GeoRanker}"; Flags: nowait postinstall skipifsilent

[InstallDelete]
; Cleanup older installations if needed
Type: filesandordirs; Name: "{app}\_MEI*"
