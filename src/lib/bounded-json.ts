export async function boundedJson(request:Request,maxBytes:number):Promise<unknown> {
 if(Number(request.headers.get('content-length'))>maxBytes)throw Error('Request too large.');
 if(!request.body)throw Error('Missing request body.');
 const reader=request.body.getReader(),decoder=new TextDecoder();let bytes=0,text='';
 while(true){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>maxBytes){await reader.cancel();throw Error('Request too large.');}text+=decoder.decode(value,{stream:true});}
 text+=decoder.decode();return JSON.parse(text);
}
