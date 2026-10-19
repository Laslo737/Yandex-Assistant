const fs=require('node:fs'),p=require('node:path'),os=require('node:os'),cp=require('node:child_process'),assert=require('node:assert/strict');
const root=fs.mkdtempSync(p.join(os.tmpdir(),'stable-path-mock-'));
const bash=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'bash';
const unix=cp.execFileSync(bash,['-c','cd "$1" && pwd -P','--',root],{encoding:'utf8'}).trim();
function write(path,text){const target=p.join(root,path);fs.mkdirSync(p.dirname(target),{recursive:true});fs.writeFileSync(target,text);if(process.platform!=='win32')fs.chmodSync(target,0o700);}
const posix=(suffix)=>unix+'/'+suffix;
function fixture(name,failReload){
 const base=name;const old=posix(base+'/old'),current=posix(base+'/releases/current'),legacy=posix(base+'/releases/legacy');
 const drop=posix(base+'/systemd/override'),backup=posix(base+'/backups'),rollback=backup+'/20261019-162724/rollback.sh';
 for(const d of ['old','releases/current','backups/20261019-162724','systemd','bin','run/lock'])fs.mkdirSync(p.join(root,base,d),{recursive:true});
 write(base+'/releases/current/.env','ADMIN_PASSWORD=fixture-only\n');
 write(base+'/old/.env','LEGACY_ONLY=true\n');
 write(base+'/systemd/override',`# release-ca65be5\n[Service]\nWorkingDirectory=${current}\nEnvironment=ENABLE_ADMIN=true\n`);
 write(base+'/backups/20261019-162724/rollback.sh',`#!/bin/bash\nset -e\nrm -- '${drop}'\necho ORIGINAL_ROLLBACK_OK\n`);
 const map=(text)=>text.replaceAll('/opt/yandex-360-ai-assistant',old).replaceAll('/opt/yassistant-releases/admin-load-20261019',current).replaceAll('/opt/yassistant-releases/legacy-843b921',legacy).replaceAll('/etc/systemd/system/yassistant.service.d/90-admin-load-release.conf',drop).replaceAll('/root/yassistant-backups',backup).replaceAll('/run/lock/yassistant-stable-path.lock',posix(base+'/run/lock/lock')).replaceAll('/opt/.yassistant-',posix(base+'/.yassistant-')).replace('[[ $EUID -eq 0 ]]','[[ 1 -eq 1 ]]');
 write(base+'/migrate-stable-path.sh',map(fs.readFileSync('ops/migrate-stable-path.sh','utf8')));
 write(base+'/rollback-stable-path.sh',map(fs.readFileSync('ops/rollback-stable-path.sh','utf8')));
 write(base+'/bin/git',`#!/bin/bash\ncase "$*" in\n*'rev-parse --short=7 HEAD'*) echo 843b921;;\n*'branch --show-current'*) echo main;;\n*'status --porcelain'*) :;;\n*'status -sb'*) echo '## main...origin/main';;\n*) exit 1;;\nesac\n`);
 write(base+'/bin/flock','#!/bin/bash\nexit 0\n');
 write(base+'/bin/curl',`#!/bin/bash\nif [[ "$*" == *'/admin'* ]];then printf 401;else printf '{"ok":true}';fi\n`);
 write(base+'/bin/systemctl',`#!/bin/bash\nset -e\necho "$*" >> '${posix(base+'/calls')}'\ncase "$1" in\nshow) case "$*" in\n*WorkingDirectory*) grep '^WorkingDirectory=' '${drop}' | cut -d= -f2-;;\n*EnvironmentFiles*) :;;\n*MainPID*) echo 4242;;\n*User*) echo root;;\n*ExecStart*) echo '{ argv[]=/usr/bin/npm start; }';;\nesac;;\nis-active) :;;\ndaemon-reload) ${failReload?`if [[ ! -e '${posix(base+'/failed-once')}' ]];then touch '${posix(base+'/failed-once')}';exit 1;fi`:':'};;\nstop|start|restart) :;;\n*) exit 1;;\nesac\n`);
 const realReadlink=cp.execFileSync(bash,['-c','command -v readlink'],{encoding:'utf8'}).trim();
 write(base+'/bin/readlink',`#!/bin/bash\nif [[ "$*" == *'/proc/4242/cwd'* ]];then echo '${current}';else exec '${realReadlink}' "$@";fi\n`);
 // Native Windows junctions expose the same is-symlink/readlink behavior to Git Bash.
 const nativeNode=process.execPath.replaceAll('\\','/');
 write(base+'/mock-install.cjs',`const fs=require('node:fs'),a=process.argv.slice(2);if(a.includes('-d'))fs.mkdirSync(a[a.length-1],{recursive:true});else fs.copyFileSync(a[a.length-2],a[a.length-1]);`);
 write(base+'/bin/install',`#!/bin/bash\nexec '${nativeNode}' '${posix(base+'/mock-install.cjs')}' "$@"\n`);
 write(base+'/make-link.cjs',`require('node:fs').symlinkSync(process.argv[2],process.argv[3],process.platform==='win32'?'junction':'dir');`);
 write(base+'/bin/ln',`#!/bin/bash\nexec '${nativeNode}' '${posix(base+'/make-link.cjs')}' "$3" "$4"\n`);
 const env={...process.env,PATH:posix(base+'/bin')+':'+cp.execFileSync(bash,['-c','printf "%s" "$PATH"'],{encoding:'utf8'}),MSYS2_ARG_CONV_EXCL:undefined};
 function run(script,arg){return cp.spawnSync(bash,['-c','export PATH="$1:$PATH"; exec bash "$2" "$3"','--',posix(base+'/bin'),script,arg],{env,encoding:'utf8',timeout:30000});}
 return {base,old,current,legacy,drop,backup,rollback,run,env};
}
try{
 const a=fixture('success',false);
 let r=a.run(posix('success/migrate-stable-path.sh'),'--check');assert.equal(r.status,0,r.stdout+r.stderr);assert.ok(!fs.existsSync(p.join(root,'success/releases/legacy')));
 r=a.run(posix('success/migrate-stable-path.sh'),'--apply');assert.equal(r.status,0,r.stdout+r.stderr);assert.match(r.stdout,/STABLE_PATH_OK/);
 assert.ok(fs.lstatSync(p.join(root,'success/old')).isSymbolicLink());
 assert.equal(fs.readFileSync(p.join(root,'success/old/.env'),'utf8'),'ADMIN_PASSWORD=fixture-only\n');
 assert.equal(fs.readFileSync(p.join(root,'success/releases/legacy/.env'),'utf8'),'LEGACY_ONLY=true\n');
 let calls=fs.readFileSync(p.join(root,'success/calls'),'utf8');assert.doesNotMatch(calls,/^(stop|start|restart) /m);
 r=a.run(a.rollback,'');assert.equal(r.status,0,r.stdout+r.stderr);assert.match(r.stdout,/ROLLBACK_OK_STABLE_PATH/);
 assert.equal(fs.readFileSync(p.join(root,'success/old/.env'),'utf8'),'LEGACY_ONLY=true\n');
 const b=fixture('failure',true);
 r=b.run(posix('failure/migrate-stable-path.sh'),'--apply');assert.notEqual(r.status,0);assert.match(r.stderr,/STABLE_PATH_FAILED_RESTORING/);
 assert.ok(!fs.lstatSync(p.join(root,'failure/old')).isSymbolicLink());assert.ok(!fs.existsSync(p.join(root,'failure/releases/legacy')));
 assert.equal(fs.readFileSync(p.join(root,'failure/releases/current/.env'),'utf8'),'ADMIN_PASSWORD=fixture-only\n');
 assert.equal(fs.readFileSync(p.join(root,'failure/systemd/override'),'utf8'),`# release-ca65be5\n[Service]\nWorkingDirectory=${b.current}\nEnvironment=ENABLE_ADMIN=true\n`);
 console.log('MIGRATION_MOCK_TESTS_OK: dry run, stable alias, unchanged env/PID, explicit legacy rollback, auto-restore on daemon-reload failure');
}finally{fs.rmSync(root,{recursive:true,force:true});}
