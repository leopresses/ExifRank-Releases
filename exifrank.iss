[Setup]
AppId={{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}
AppName=ExifRank
AppVersion=1.1.1
AppPublisher=Léo Presses
AppPublisherURL=https://exifrank.app
AppSupportURL=https://exifrank.app
AppUpdatesURL=https://exifrank.app
DefaultDirName={autopf}\ExifRank
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
