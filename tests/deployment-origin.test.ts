import test from 'node:test';
import assert from 'node:assert/strict';
import {deploymentOrigin} from '../src/lib/deployment-origin.ts';
test('preview origin uses only the platform-configured deployment hostname',()=>{
 assert.equal(deploymentOrigin({VERCEL_ENV:'preview',VERCEL_URL:'mandapam-abc.vercel.app'},true),'https://mandapam-abc.vercel.app');
 assert.equal(deploymentOrigin({VERCEL_ENV:'production',VERCEL_URL:'mandapam-abc.vercel.app'},true),null);
 assert.equal(deploymentOrigin({APP_ORIGIN:'https://app.example.invalid',VERCEL_ENV:'preview',VERCEL_URL:'other.vercel.app'},true),'https://app.example.invalid');
 for(const VERCEL_URL of ['evil.invalid','abc.vercel.app/evil','user@abc.vercel.app','https://abc.vercel.app'])assert.equal(deploymentOrigin({VERCEL_ENV:'preview',VERCEL_URL},true),null);
 assert.equal(deploymentOrigin({APP_ORIGIN:'http://localhost:3107'},false),'http://localhost:3107');
 assert.equal(deploymentOrigin({APP_ORIGIN:'http://localhost:3107'},true),null);
});
