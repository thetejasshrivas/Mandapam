import "server-only";
import { serverClient,verifiedUser } from "./client";
export const weddingFields="id,title,city,state,state_version,budget_ceiling_paise,wedding_date,is_tentative,draft_locked";
export async function accountContext() {
  const client=await serverClient();
  if(!client)return null;
  const user=await verifiedUser(client);
  return user ? {client,user}:null;
}
