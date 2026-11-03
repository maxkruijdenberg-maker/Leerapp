const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {getBinFromUrl}=require('app-builder-lib/out/binDownload');
const {version}=require('../package.json');
(async()=>{const project=path.resolve(__dirname,'..'),dist=path.join(project,'dist'),payload=path.join(dist,'win-unpacked');
const nsis=await getBinFromUrl('nsis','3.0.4.1','VKMiizYdmNdJOWpRGz4trl4lD++BvYP2irAXpMilheUP0pc93iKlWAoP843Vlraj8YG19CVn0j+dCo/hURz9+Q==');
for(const f of fs.readdirSync(payload)){if(f==='electron.exe'||f.startsWith('.Makelaar Academie.exe.')||f.startsWith('.electron.exe.'))fs.rmSync(path.join(payload,f),{force:true});}
const files=fs.readdirSync(payload,{recursive:true}).filter(f=>fs.statSync(path.join(payload,f)).isFile());
const dirs=fs.readdirSync(payload,{recursive:true}).filter(f=>fs.statSync(path.join(payload,f)).isDirectory()).sort((a,b)=>b.length-a.length);
const installer=path.join(dist,'Makelaar-Academie-Setup-'+version+'.exe');
const script=`Unicode true
!include "MUI2.nsh"
!include "x64.nsh"
Name "Makelaar Academie"
OutFile "${installer}"
InstallDir "$LOCALAPPDATA\\Programs\\Makelaar Academie"
RequestExecutionLevel user
SetCompressor zlib
Icon "${path.join(project,'app/icon.ico')}"
UninstallIcon "${path.join(project,'app/icon.ico')}"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "Welkom bij Makelaar Academie"
!define MUI_WELCOMEPAGE_TEXT "Je eigen offline leeromgeving voor Makelaar Wonen. Deze installatie maakt een snelkoppeling op je bureaublad. Sluit een eventuele eerdere versie van de app voordat je verdergaat."
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Dutch"
Function .onInit
 IfFileExists "$EXEDIR\\app\\Makelaar Academie.exe" +3 0
 MessageBox MB_OK "Pak eerst de volledige ZIP uit. De map app moet naast dit installatieprogramma staan."
 Abort
  \${IfNot} \${RunningX64}
    MessageBox MB_OK "Deze versie is bedoeld voor Windows x64."
    Abort
  \${EndIf}
FunctionEnd
Section "Installeren"
 SetShellVarContext current
 SetOutPath "$INSTDIR"
 ${dirs.map(f=>'CreateDirectory "$INSTDIR\\'+f.replaceAll('/','\\')+'"').join('\n ')}
 ${files.map(f=>'ClearErrors\n CopyFiles /SILENT "$EXEDIR\\app\\'+f.replaceAll('/','\\')+'" "$INSTDIR\\'+f.replaceAll('/','\\')+'"\n IfErrors 0 +3\n MessageBox MB_OK "Kopiëren mislukt. Sluit de app, controleer de uitgepakte bestanden en probeer opnieuw."\n Abort').join('\n ')}
 Delete "$INSTDIR\\Academie.ico"
 File /oname=Academie-${version}.ico "${path.join(project,'app/icon.ico')}"
 WriteUninstaller "$INSTDIR\\Verwijderen.exe"
 CreateShortcut "$DESKTOP\\Makelaar Academie.lnk" "$INSTDIR\\Makelaar Academie.exe" "" "$INSTDIR\\Academie-${version}.ico"
 CreateDirectory "$SMPROGRAMS\\Makelaar Academie"
 CreateShortcut "$SMPROGRAMS\\Makelaar Academie\\Makelaar Academie.lnk" "$INSTDIR\\Makelaar Academie.exe" "" "$INSTDIR\\Academie-${version}.ico"
 WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\MakelaarAcademie" "DisplayName" "Makelaar Academie"
 WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\MakelaarAcademie" "UninstallString" '$\\"$INSTDIR\\Verwijderen.exe$\\"'
 WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\MakelaarAcademie" "DisplayVersion" "${version}"
 WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\MakelaarAcademie" "Publisher" "Makelaar Academie"
 WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\MakelaarAcademie" "DisplayIcon" "$INSTDIR\\Academie-${version}.ico"
SectionEnd
Section "Uninstall"
 SetShellVarContext current
 ${files.map(f=>'Delete "$INSTDIR\\'+f.replaceAll('/','\\')+'"').join('\n ')}
 ${dirs.map(f=>'RMDir "$INSTDIR\\'+f.replaceAll('/','\\')+'"').join('\n ')}
 Delete "$INSTDIR\\Academie-${version}.ico"
 Delete "$INSTDIR\\Verwijderen.exe"
 Delete "$DESKTOP\\Makelaar Academie.lnk"
 Delete "$SMPROGRAMS\\Makelaar Academie\\Makelaar Academie.lnk"
 RMDir "$SMPROGRAMS\\Makelaar Academie"
 RMDir "$INSTDIR"
 DeleteRegKey HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\MakelaarAcademie"
SectionEnd
`;
const file=path.join(dist,'installer.nsi');fs.writeFileSync(file,script);const bin=path.join(nsis,process.platform==='win32'?'Bin/makensis.exe':'linux/makensis');const r=spawnSync(bin,['-V2',file],{stdio:'inherit',env:{...process.env,NSISDIR:nsis}});if(r.status!==0)throw Error('Installer build failed: '+r.status);console.log('Installer ready: '+installer);})();
