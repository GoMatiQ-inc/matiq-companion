const {createAuthorizationFixture}=require('./ci-mac-authorization.cjs');
const fixture=createAuthorizationFixture();
try {fixture.prepare();console.log('PASS: disposable CI administrator enforces its generated password.',JSON.stringify(fixture.identity));}
finally {fixture.close();}
