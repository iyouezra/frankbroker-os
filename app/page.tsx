import { getChatGPTUser } from "./chatgpt-auth";
import FrankBrokerApp from "./frankbroker-app";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getChatGPTUser();
  return <FrankBrokerApp userName={user?.fullName ?? "Mekdes Tadesse"} />;
}
