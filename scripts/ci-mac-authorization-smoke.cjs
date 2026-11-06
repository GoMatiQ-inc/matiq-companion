const {execFileSync}=require('node:child_process');
const {randomBytes}=require('node:crypto');
const path=require('node:path');
const keys=['GITHUB_ACTIONS','RUNNER_ENVIRONMENT','GITHUB_REPOSITORY','GITHUB_RUN_ID','GITHUB_RUN_ATTEMPT','RUNNER_TEMP'];
const args=['-n','/usr/bin/env',...keys.map(key=>key+'='+process.env[key]),'/usr/bin/python3',path.join(__dirname,'ci-mac-authorization.py')];
const invoke=(operation,data={})=>JSON.parse(execFileSync('/usr/bin/sudo',[...args,operation],{input:JSON.stringify(data),encoding:'utf8',timeout:100000}));
try {
  const result=invoke('create',{password:randomBytes(24).toString('hex')+'aA7!'});
  console.log('PASS: disposable non-login CI administrator password is verified; wrong password is rejected.',JSON.stringify(result));
} finally {
  const result=invoke('delete');
  if(!result.accountAbsent || !result.homeAbsent)throw Error('The owned fixture identity was not removed.');
  console.log('PASS: owned fixture identity and home are absent.');
}
