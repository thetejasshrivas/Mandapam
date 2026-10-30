// Render contract only; provider/session boundaries are covered by the auth route suites.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
import {safeReturnTo} from '../src/server/auth/policy.ts';
const require=createRequire(import.meta.url);
async function render(query={},ready=true){
 const loaded={exports:{}};const js=ts.transpileModule(readFileSync('src/app/login/page.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
 const styles=new Proxy({},{get:(_,key)=>String(key)});
 const mocks={'@/server/auth/config':{authConfig:()=>ready?{}:null},'@/server/auth/policy':{safeReturnTo},'./login.module.css':{default:styles},'next/link':{default:({prefetch,children,...props})=>{void prefetch;return createElement('a',props,children);}},'next/image':{default:({priority,...props})=>{void priority;return createElement('img',props);}}};
 new Function('require','module','exports',js)(name=>name in mocks?mocks[name]:require(name),loaded,loaded.exports);
 return renderToStaticMarkup(await loaded.exports.default({searchParams:Promise.resolve(query)}));
}
test('Welcome entry presents Mandapam identity and keeps all three POST auth paths',async()=>{const html=await render({next:'/workspace'});assert.match(html,/>Mandapam</);assert.match(html,/Your wedding/);assert.match(html,/<h1[^>]*>Welcome back<\/h1>/);for(const path of ['google','login','signup'])assert.match(html,new RegExp('action="/auth/'+path+'" method="post"'));assert.equal((html.match(/name="next" value="\/workspace"/g)||[]).length,3);assert.match(html,/Continue with Google/);assert.match(html,/Create an account/);});
test('Return targets and auth feedback remain safe and accessible',async()=>{const html=await render({next:'https://evil.invalid',message:'oauth_cancelled'});assert.doesNotMatch(html,/value="https:\/\/evil/);assert.match(html,/role="status"/);assert.match(html,/Google sign-in was cancelled/);assert.match(html,/autoComplete="current-password"/i);assert.match(html,/autoComplete="new-password"/i);assert.match(html,/minLength="12"/i);assert.match(html,/for="email"/);assert.match(html,/for="password"/);assert.doesNotMatch(await render({message:'untrusted-message'}),/untrusted-message/);});
test('Unconfigured auth retains disabled controls and an honest status',async()=>{const html=await render({},false);assert.match(html,/Account access is not configured/);assert.equal((html.match(/<button[^>]*disabled=""/g)||[]).length,3);assert.equal((html.match(/<input[^>]*disabled=""/g)||[]).length,4);});
