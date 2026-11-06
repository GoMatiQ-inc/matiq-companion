const {execFileSync}=require('node:child_process');
const {randomBytes}=require('node:crypto');
const path=require('node:path');
const keys=['GITHUB_ACTIONS','RUNNER_ENVIRONMENT','GITHUB_REPOSITORY','GITHUB_RUN_ID','GITHUB_RUN_ATTEMPT','RUNNER_TEMP'];
const args=['-n','/usr/bin/env',...keys.map(key=>key+'='+process.env[key]),'/usr/bin/python3',path.join(__dirname,'ci-mac-authorization.py')];
const invoke=(operation,data={})=>JSON.parse(execFileSync('/usr/bin/sudo',[...args,operation],{input:JSON.stringify(data),encoding:'utf8',timeout:100000}));
function createAuthorizationFixture(){
  let password=randomBytes(24).toString('hex')+'aA7!';
  let identity;
  try {identity=invoke('create',{password});}
  catch(error){invoke('delete');password='';throw error;}
  const right=operation=>JSON.parse(execFileSync('/usr/bin/python3',[path.join(__dirname,'ci-mac-authorization-right.py')],{input:JSON.stringify({operation,name:identity.name,password:operation==='grant'?password:undefined}),encoding:'utf8',timeout:20000}));
  return {
    identity,
    prepare(){
      const result=right('grant');
      if(!result.authorized||!result.wrongPasswordRejected||!result.sessionCredentialVerified)throw Error('The native authorization credential was not qualified.');
      console.log('PASS: OS authorization rejects the wrong password and accepts the owned CI credential.');
    },
    async authorize(){console.log('The signed updater must obtain its own right from the authenticated CI session.');},
    close(){
      try {const cleared=right('revoke');if(!cleared.authorizationAbsent)throw Error('The CI authorization remains.');}
      finally {const result=invoke('delete');password='';
      if(!result.accountAbsent||!result.homeAbsent)throw Error('The owned authorization fixture remains.');}
      console.log('PASS: the owned authorization identity and home are absent.');
    }
  };
}
module.exports={createAuthorizationFixture};
