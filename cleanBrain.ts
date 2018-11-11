import Chatbot from "./chatbot";
let bot = new Chatbot(/billy/, 'billy');
bot.brainFile = "./charlies.brn";

import fs from "fs";

bot.loadBrain();

const filtered = Object.keys(bot.brain.lexicon)
   .filter(key => bot.brain.lexicon[key].frequency > 2800)
   .reduce((newObj, key) => {
      newObj[key] = bot.brain.lexicon[key];
      return newObj;
   }, {});

fs.writeFileSync("./filtered.brn", JSON.stringify(filtered), 'utf8');