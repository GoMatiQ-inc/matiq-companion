const {execFileSync}=require('node:child_process');
const {randomBytes}=require('node:crypto');
const path=require('node:path');
const {waitFor}=require('./wait-for.cjs');
const keys=['GITHUB_ACTIONS','RUNNER_ENVIRONMENT','GITHUB_REPOSITORY','GITHUB_RUN_ID','GITHUB_RUN_ATTEMPT','RUNNER_TEMP'];
const args=['-n','/usr/bin/env',...keys.map(key=>key+'='+process.env[key]),'/usr/bin/python3',path.join(__dirname,'ci-mac-authorization.py')];
const invoke=(operation,data={})=>JSON.parse(execFileSync('/usr/bin/sudo',[...args,operation],{input:JSON.stringify(data),encoding:'utf8',timeout:100000}));
function createAuthorizationFixture(){
  let password=randomBytes(24).toString('hex')+'aA7!';
  let identity;
  try {identity=invoke('create',{password});}
  catch(error){invoke('delete');password='';throw error;}
  const script=path.join(__dirname,'ci-mac-authorization.jxa');
  return {
    identity,
    async authorize(){
      await waitFor(()=>{
        const result=JSON.parse(execFileSync('/usr/bin/osascript',['-l','JavaScript',script],{input:JSON.stringify({name:identity.name,password}),encoding:'utf8',timeout:12000}));
        if(result.error)throw Error(`Native CI helper authorization failed at ${result.error} (${result.number??'unknown'}); inspect the captured OS dialog.`);
        if(result.authorizationSubmitted)console.log("Native secure-field length before submission:",result.passwordLength);
        return result.authorizationSubmitted;
      },'The normal Companion Add Helper authorization dialog',30000);
      console.log('Native OS helper authorization was submitted using the owned CI identity.');
    },
    close(){
      const result=invoke('delete');password='';
      if(!result.accountAbsent||!result.homeAbsent)throw Error('The owned authorization fixture remains.');
      console.log('PASS: the owned authorization identity and home are absent.');
    }
  };
}
module.exports={createAuthorizationFixture};
