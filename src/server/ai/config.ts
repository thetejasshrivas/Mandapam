import 'server-only';
export function aiConfig() {
 const key=process.env.GEMINI_API_KEY?.trim(),signing=process.env.AI_RECEIPT_SECRET?.trim();
 if(process.env.AI_NO_COST_CONFIRMED!=='true'||!key||!signing||signing.length<32)return null;
 return {key,signing};
}
