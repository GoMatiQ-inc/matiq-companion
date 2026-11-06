const {execFileSync}=require('node:child_process');
const {randomBytes}=require('node:crypto');
const path=require('node:path');
const {waitFor}=require('./wait-for.cjs');
const keys=['GITHUB_ACTIONS','RUNNER_ENVIRONMENT','GITHUB_REPOSITORY','GITHUB_RUN_ID','GITHUB_RUN_ATTEMPT','RUNNER_TEMP'];
const args=['-n','/usr/bin/env',...keys.map(key=>key+'='+process.env[key]),'/usr/bin/python3',path.join(__dirname,'ci-mac-authorization.py')];
const invoke=(operation,data={})=>JSON.parse(execFileSync('/usr/bin/sudo',[...args,operation],{input:JSON.stringify(data),encoding:'utf8',timeout:100000}));
function createAuthorizationFixture(){
  let password=randomBytes(32).toString('hex');
  let identity;
  try {identity=invoke('create',{password});}
  catch(error){invoke('delete');password='';throw error;}
  const script=path.join(__dirname,'ci-mac-authorization.jxa');
  return {
    identity,
    async authorize(){
      const target=await waitFor(()=>{
        const result=JSON.parse(execFileSync('/usr/bin/osascript',['-l','JavaScript',script],{input:JSON.stringify({name:identity.name,password}),encoding:'utf8',timeout:12000}));
        if(result.error)throw Error(`Native CI helper authorization failed at ${result.error} (${result.number??'unknown'}); inspect the captured OS dialog.`);
        return result.readyToSubmit?result:false;
      },'The normal Companion Add Helper authorization dialog',30000);
      const input=require('../src/native/mac-computer.node');
      const access=input.access();
      if(!access.accessibility||!access.postEvents)throw Error('Normal macOS input permission is required for the CI update driver.');
      const actual=input.click(...target.point);
      if(actual!==target.securityAgentPid)throw Error('The observed authorization button changed target; inspect the native capture.');
      console.log('Native Add Helper pointer input was submitted to the verified SecurityAgent button.');
    },
    close(){
      const result=invoke('delete');password='';
      if(!result.accountAbsent||!result.homeAbsent)throw Error('The owned authorization fixture remains.');
      console.log('PASS: the owned authorization identity and home are absent.');
    }
  };
}
module.exports={createAuthorizationFixture};
