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
  const script=`ObjC.import('Foundation');const data=$.NSFileHandle.fileHandleWithStandardInput.readDataToEndOfFile;const config=JSON.parse(ObjC.unwrap($.NSString.alloc.initWithDataEncoding(data,$.NSUTF8StringEncoding)));let step='locate';let result;try{const agent=Application('System Events').processes.byName('SecurityAgent');if(!agent.exists()||agent.windows().length===0){result={ready:false};}else{const window=agent.windows[0];step='validate';const texts=window.staticTexts().map(text=>text.name());if(!texts.includes('MatiQ Companion')||!texts.some(text=>text.includes('An update is ready to install.'))||!texts.some(text=>text.includes('new helper tool')))throw Error('Unexpected authorization request.');const fields=window.textFields();if(fields.length!==2)throw Error('Inspect the changed authorization layout.');const button=window.buttons.byName('Add Helper');if(!button.exists())throw Error('Inspect the helper authorization action.');step='fill';fields[0].value=config.name;if(fields[0].value()!==config.name)throw Error('The fixture identity was not selected.');fields[1].value=config.password;step='submit';button.click();result={authorizationSubmitted:true};}}catch(error){result={error:step,number:Number(error.errorNumber)||null};}JSON.stringify(result);`;
  return {
    identity,
    async authorize(){
      await waitFor(()=>{
        const result=JSON.parse(execFileSync('/usr/bin/osascript',['-l','JavaScript','-e',script],{input:JSON.stringify({name:identity.name,password}),encoding:'utf8',timeout:12000}));
        if(result.error)throw Error(`Native CI helper authorization failed at ${result.error}; inspect the captured OS dialog.`);
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
