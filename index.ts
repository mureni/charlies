import Discord from 'discord.js';
import Chatbot from './chatbot';
import { CONFIG } from './charlies.config';
import { log, chalk } from './logger';

type TriggerResult = { success: true, value: any, haltTriggers: boolean, silent?: boolean  } | { success: false, error: string, haltTriggers: boolean, silent?: boolean }
interface Trigger {
   command: RegExp | string;
   action(...params: any): TriggerResult;
}

const client = new Discord.Client();
const chatbot = new Chatbot(CONFIG.bot.respondsTo, CONFIG.bot.name, CONFIG.bot.brain, CONFIG.bot.trainerFile, CONFIG.bot.brainFile, CONFIG.bot.settings);

const login = () => {
   client.login(CONFIG.discord_token).then(token => {
      log(`Logged in to Discord servers using token: ${chalk.bgWhite.white(token)}`);
   }).catch(token => {
      log(`Error logging in to Discord servers using token: ${chalk.bgRed.red(token)}`, 'error');
   });   
}

client.on('error', (error: Error) => {
   log(`Error occured in connection to Discord servers: ${error.message}.`, `error`);
});
client.on('reconnecting', () => {
   log(`Reconnecting to Discord servers.`);
});
client.on('disconnect', (event: CloseEvent)=> {
   log(`Disconnected from Discord servers. Reason: ${event.reason}. Trying again in 1 minute.`);
   setInterval(login, 60000);   
});
client.on('ready', () => {
   log(`Connected to Discord servers. Loading bot brain...`);
   try {
      chatbot.loadBrain();
      log(`Bot brain loaded!`)
   } catch {
       log(`Error loading bot brain.`, 'error');
   }
});
client.on('quit', () => {
   log(`Saving bot brain...`);
   try {
      chatbot.saveBrain();
      log(`Bot brain saved!`);
   } catch {
      log(`Error saving bot brain.`, 'error');
   }
});
client.on('guildMemberUpdate', (oldMember: Discord.GuildMember, newMember: Discord.GuildMember) => {
   if (oldMember.id === client.user.id || newMember.user.id === client.user.id) {
      if (newMember.nickname !== chatbot.name) chatbot.name = newMember.nickname;               
   }
});
client.on('message', (message: Discord.Message) => {
   const msgText = message.cleanContent.normalize().replace(`<@${client.user.id}>`, client.user.username);
   const format = (timestamp, source, user, text) => `${timestamp} <${source}:${user}> ${text}`;
   const ownMessage = (message.author.id === client.user.id);
      
   log(format(new Date(message.createdTimestamp).toLocaleTimeString(CONFIG.locale),
               chalk.green(message.channel.type === "text" ? message.guild.name : message.channel.type),
               ownMessage ? chalk.cyanBright(message.author.username): chalk.greenBright(message.author.username),
               chalk.blueBright(msgText)
   ));

   // Parse and execute triggers      
   if (!ownMessage) {
      let halt = false;
      Triggers.forEach(trigger => {
         const matches = message.cleanContent.normalize().match(trigger.command);
         if (!halt && matches) {            
            const result = trigger.action(message, matches);
            if (result.success && result.value) {
               log(`Trigger ${trigger.command} executed. Result: ${result.value}`, 'bot-message');
            } else if (!result.success && result.error) {
               log('Trigger failed: ${result.error}', 'error');
            }
            halt = result.haltTriggers;
         }
      });
   }       
});



const Triggers: Trigger[] = [{    
   command: /^!ping/i,
   action: (context: Discord.Message) => {
      sendMessage(context, 'pong');
      log(`Pinged at ${new Date().toLocaleTimeString(CONFIG.locale)}`);                  
      return { success: true, value: null, haltTriggers: true };
   }
}, {
   command: /^!save/i,
   action: (context: Discord.Message) => {
      sendMessage(context, `saving my brain thanks for the reminder`);
      log(`Saving brain...`);
      chatbot.saveBrain();
      log(`Saved!`);
      return { success: true, value: null, haltTriggers: true };
   }
}, {
   command: /charlies talk to (.+)/i,
   action: (context: Discord.Message, matches: string[] = []) => {
      let response: string, toUser: string, fromUser: string;

      fromUser = (context.member && context.member.nickname) ? context.member.nickname : context.author.username;
         
      if (matches.length === 0) toUser = fromUser;
      
      toUser = matches[1];
      if (toUser.toLowerCase() === 'me') toUser = fromUser;        
   
      response = getResponse(context, context.cleanContent.normalize(), fromUser, toUser, true);
      if (!response) return { success: false, error: 'No response', haltTriggers: false }

      sendMessage(context, response, true);
      return { success: true, value: null, haltTriggers: true };
   }   
}, {
   command: /tell\s*(\S+)\s*a?\s*story(?:\s*about\s*)?(.*)?/i,
   action: (context: Discord.Message, matches: string[] = []) => {
      let fromUser: string, toUser: string, seed: string, story: string, storySeed: string;
      
      const storyLength: number = 3 + Math.floor(Math.random() * 4);

      fromUser = (context.member && context.member.nickname) ? context.member.nickname : context.author.username;
      toUser = (matches.length > 0) ? matches[1].toLowerCase() : "";

      if (toUser === 'me') {
         toUser = fromUser;
      } else if (toUser === 'yourself' || toUser === 'you') {
         toUser = "dear diary";
      }

      if (matches.length > 2 && matches[2] !== undefined) {
         seed = matches[2];
      } else {
         seed = chatbot.brain.getSeedFromText();
      }
      
      storySeed = chatbot.brain.getReply(seed);
      if (!storySeed) return { success: false, error: 'Unable to process story response', haltTriggers: false };

      log(`Telling ${toUser} a story about ${seed}`, 'bot-message');
      for (let lineCounter = 0; lineCounter < storyLength; lineCounter++) {         
         story = getResponse(context, storySeed, fromUser, toUser, true, true, seed);
         if (!story) break;
         log(`Line ${lineCounter} (seed: ${seed}): ${story}`, 'bot-message');
         sendMessage(context, story, context.tts);
         
         seed = chatbot.brain.getSeedFromText(storySeed);
         storySeed = chatbot.brain.getReply(seed);
      }
      return { success: true, value: null, haltTriggers: true };
   }
}, {
   command: /.+/i,
   action: (context: Discord.Message) => {      
      let response: string;
      response = getResponse(context, context.cleanContent.normalize(), "", "", false);
      if (!response) return { success: true, value: null, haltTriggers: false }

      sendMessage(context, response, context.tts);
      return { success: true, value: response, haltTriggers: true };
   }
}];

const getResponse = (context: Discord.Message, message: string = "", fromUser: string = "", toUser: string = "", forceRespond: boolean = false, forceSilence: boolean = false, forceSeed: string = ""): string => {
   let messageText: string, response: string, directResponse: boolean;

   if (!fromUser) fromUser = (context.member && context.member.nickname) ? context.member.nickname : context.author.username;
   if (!toUser) toUser = client.user.username;
   if (!message) message = context.cleanContent.normalize();

   messageText = message.replace(`<@${client.user.id}>`, client.user.username);   

   response = forceSilence ? messageText : chatbot.parseInput(messageText, forceRespond, forceSeed);
   if (!response) return "";   

   directResponse = (context.channel.type !== "dm" && toUser !== client.user.username) && (
         (Math.random() > .5)
      || (toUser === fromUser)
   );   
   if (directResponse) response = `${toUser}: ${response}`;
   if (response.startsWith(':')) response = `${toUser}${response}`;
   return response.trim();
}

const sendMessage = (context: Discord.Message, message: string, tts: boolean = context.tts) => {
   context.channel.send(message, { tts: tts }).catch(reason => log(`Unable to send message: ${reason}`));
}


// Start
login();
log(`Initialized. Things will now happen as they may.`);