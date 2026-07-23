import { PandaClient } from "@panda/sdk";

const client = new PandaClient();
const result = await client.run({
  input: "Run the PANDA loop once.",
});

console.log(result.output);
