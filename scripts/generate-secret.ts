import crypto from "crypto";
const bytes = Number(process.argv[2]) || 64;
console.log(crypto.randomBytes(bytes).toString("hex"));
