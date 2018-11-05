import MarkovChain from './markovChain';
import fs from 'fs';
interface ChatbotSettings {
   outburst: number;
   responsiveness: number;
   anger: number;
   irritability: number;
   recursion: number;
   calmdown: number;
}
interface Chatbot {
   respondsTo: RegExp;
   name: string;
   brain: MarkovChain;
   trainerFile: string;
   brainFile: string;
   settings: ChatbotSettings;
   logger: Function;
   loadTrainer(file: string): void;
   loadBrain(file: string): void;
   saveBrain(file: string): void;
   parseInput(
      input: string,
      forceRespond?: boolean,
      forceSeed?: string,
      recursion?: number
   ): string;
}
class Chatbot implements Chatbot {
   constructor(
      respondsTo: RegExp = /chatbot['s:]*\s*/i,
      name: string = "chatbot",
      brain: MarkovChain = new MarkovChain(3),
      trainerFile: string = "./chatbot.trn",
      brainFile: string = "./chatbot.brn",
      settings: ChatbotSettings = {
         outburst: 0.015,
         responsiveness: 1,
         anger: 0.5,
         irritability: 1.1,
         recursion: 1,
         calmdown: 2
      },
      logger: Function = console.log
   ) {
      this.respondsTo = respondsTo;
      this.name = name;
      this.brain = brain;
      this.trainerFile = trainerFile;
      this.brainFile = brainFile;
      this.settings = settings;
      this.logger = logger;
   }
   loadTrainer(file: string = this.trainerFile): void {
      if (fs.existsSync(file)) {
         this.logger(`Loading trainer ${file}`);
         const trainerData: string = fs.readFileSync(file, 'utf8');
         this.brain.learn(trainerData.toLowerCase());
      }
      return;
   }

   loadBrain(file: string = this.brainFile): void {
      if (fs.existsSync(file)) {         
         this.brain.deserialize(fs.readFileSync(file, 'utf8'));
      } else {
         this.loadTrainer();
      }
      return;
   }

   saveBrain(file: string = this.brainFile): void {
      fs.writeFileSync(file, this.brain.serialize(), 'utf8');
      return;
   }
   parseInput(
      input: string = "",
      forceRespond: boolean = false,
      seed: string = "",
      recursion: number = this.settings.recursion      
   ): string {
      // Read the input, learn it, and reply if appropriate
      let response: string, wasMentioned: boolean, shouldReply: boolean, shouldOutburst: boolean;
      if (!input) return "";
                  
      response = input.normalize().replace(this.respondsTo, "");
      this.brain.learn(response);      
      if (!seed) seed = this.brain.getSeedFromText(response);

      wasMentioned = input.match(this.respondsTo) !== null;
      shouldOutburst = (this.settings.outburst > Math.random()) || (this.settings.anger > Math.random());
      shouldReply = forceRespond || wasMentioned || shouldOutburst;
     
      if (shouldReply) {
         for (let i = 0; i < recursion; i++) {            
            response = this.brain.getReply(seed);            
            seed = this.brain.getSeedFromText(response);            
         }
      } else {
         response = "";
      }      
      return this.processReply(response);
   }

   processReply(reply: string = ""): string {
      if (reply === "") return "";
      reply = reply.normalize();
      // Apply settings modifiers
      if (reply.toUpperCase() === reply) {
         this.settings.anger *= this.settings.irritability;
      } else {
         this.settings.anger /= Math.max(0, this.settings.calmdown);
      }
      if (this.settings.anger > Math.random()) reply = reply.toUpperCase();      

      reply = reply.trim();

      const punctuation = reply.match(/\.\?\!$/);
      if (punctuation) reply = reply.substring(0, [...reply].length - 1);
      const characters = [...reply];      
      let curly = 0, square = 0, parenthesis = 0, doubleQuote = 0, angledQuote = 0;      
      characters.forEach(char => {
         switch (char) {
            case "(": parenthesis++; break; 
            case ")": parenthesis--; break;
            case "[": square++; break;
            case "]": square--; break;
            case "{": curly++; break;
            case "}": curly--; break;
            case "\"": if ((doubleQuote++ % 2) == 0) doubleQuote--; break;
            case "`": if ((angledQuote++ % 2) == 0) angledQuote--; break;
            default: break;
         }
      });
      if (parenthesis < 0) reply = "(".repeat(-parenthesis).concat(reply);
      if (parenthesis > 0) reply = reply.concat(")".repeat(parenthesis));
      if (square < 0) reply = "[".repeat(-square).concat(reply);
      if (square > 0) reply = reply.concat("]".repeat(square));
      if (curly < 0) reply = "{".repeat(-curly).concat(reply);
      if (curly > 0) reply = reply.concat("}".repeat(curly));
      if (doubleQuote) reply = reply.concat("\"");
      if (angledQuote) reply = reply.concat("`");
      if (punctuation) reply = reply.concat(punctuation[0]);
      return reply.replace(/^[^\[\(\{\'\"\`\w]/, '') + '\n';
   }
}
export default Chatbot;
