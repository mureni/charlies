import Discord from 'discord.js';
import Chatbot from './chatbot';
import a0l from './aol';
import getTarotHand from './tarot';
import { CONFIG } from './charlies.config';
import { log, chalk } from './logger';

type TriggerResult = { success: true, value: any, haltTriggers: boolean, silent?: boolean  } | { success: false, error: string, haltTriggers: boolean, silent?: boolean }
interface Trigger {
   command: RegExp | string;
   action(...params: any[]): TriggerResult;
}
interface Conversation {
   [partner: string]: {
      lastTopic: string;
      lastMessageTime: number;   
   }
}
const DEBUG = process.env.NODE_ENV === "development";


class DiscordBot {
   client: Discord.Client;
   chatbot: Chatbot;
   conversations: Conversation;
   dirtyBrain: boolean;
   triggers: Trigger[];
   constructor(client: Discord.Client = new Discord.Client(),
               bot: Chatbot = new Chatbot(CONFIG.bot.respondsTo, CONFIG.bot.name, CONFIG.bot.brain, CONFIG.bot.trainerFile, CONFIG.bot.brainFile, CONFIG.bot.settings, log)
   ) {
      this.client = client;
      this.chatbot = bot;
      this.conversations = {};

      process.stdin.resume();
      process.on('exit', this.exitHandler.bind(this));
      process.on('SIGTERM', this.exitHandler.bind(this));
      process.on('SIGUSR1', this.exitHandler.bind(this));
      process.on('SIGUSR2', this.exitHandler.bind(this));
      if (!DEBUG) {
         process.on('uncaughtException', this.exitHandler.bind(this));
      } else {
/*          process.on('uncaughtException', (error: Error) => {
            this.exitHandler();
            throw error;
         }) */
      }
      this.client.on('quit', this.exitHandler.bind(this));
      this.client.on('error', (error: Error) => log(`Error occured in connection to Discord servers: ${error.message}.`, `info`));
      this.client.on('reconnecting', () => log(`Reconnecting to Discord servers.`, 'info'));      
      this.client.on('disconnect', (event: CloseEvent)=> {
         log(`Disconnected from Discord servers. Reason: ${event.reason}. Trying again in 1 minute.`, 'info');
         setTimeout(this.login, 60000);
      });
      this.client.on('ready', () => {
         log(`Connected to Discord servers. Loading bot brain...`);
         try {      
            this.chatbot.loadBrain();
            log(`Bot brain loaded!`, 'bot-message')
            setInterval(this.saveDirtyBrain, 1000 * 60 * 60); // 10m
         } catch (err) {
            log(`Error loading bot brain: ${err}`, 'error');
         }
      });
      
      this.client.on('guildMemberUpdate', this.reclaimNick.bind(this));
      this.client.on('message', this.processMessageByContext.bind(this));
      
      this.triggers = this.loadTriggers();
      this.dirtyBrain = false;
      // Start
      this.login();
      log(`Initialized at ${new Date(Date.now()).toLocaleTimeString(CONFIG.locale)}`, 'info');
   }
   saveDirtyBrain() {
      if (this.dirtyBrain) {
         log(`Attempting to save bot brain...`, 'bot-message');
         this.chatbot.saveBrain();
         this.dirtyBrain = false;      
      }
   }
   login() {
      this.client.login(CONFIG.discord_token).then(token => {
         log(`Logged in to Discord servers using token: ${chalk.bgWhite.white(token)}`, 'info');
      }).catch(token => {
         log(`Error logging in to Discord servers using token: ${chalk.bgRed.red(token)}`, 'error');
         this.exitHandler();
      });
   }
   exitHandler(..._params: any[]) {      
      this.client.destroy();      
      if (!DEBUG) this.saveDirtyBrain();
      process.exit();      
   }
   reclaimNick(oldMember: Discord.GuildMember, newMember: Discord.GuildMember) {
      if (oldMember.id !== this.client.user.id || newMember.user.id !== this.client.user.id) return;
      if (newMember.hasPermission("MANAGE_NICKNAMES") && newMember.hasPermission("CHANGE_NICKNAME")) newMember.setNickname(this.chatbot.name);               
   }
   processMessageByContext(context: Discord.Message) {
      let msgText = this.interpolateUsers(context, context.content);
      msgText = msgText.replace(/\s+/gu, ' ');
      const format = (timestamp, source, user, text) => `${timestamp} <${source}:${user}> ${text}`;
      const ownMessage = (context.author.id === this.client.user.id);
      if (ownMessage && context.member && context.member.nickname !== this.chatbot.name) context.guild.member(this.client.user).setNickname(this.chatbot.name);

      log(format(new Date(context.createdTimestamp).toLocaleTimeString(CONFIG.locale),
                  chalk.green(context.channel.type === "text" ? context.guild.name : context.channel.type),
                  ownMessage ? chalk.cyanBright(context.author.username): chalk.greenBright(context.author.username),
                  chalk.blueBright(msgText)
      ));

      // Parse and execute triggers      
      if (!ownMessage) {
         this.dirtyBrain = true;
         let halt = false;        
         
         this.triggers.forEach(trigger => {
            const matches: RegExpMatchArray | null = msgText.match(trigger.command);
            
            if (!halt && matches) {
               const result = trigger.action(context, matches);
               if (result.success && result.value) {
                  log(`Trigger ${trigger.command} executed. Result: ${result.value}`, 'info');
               } else if (!result.success && result.error) {
                  log(`Trigger failed: ${result.error}`, 'error');
               }
               halt = result.haltTriggers;
            }
         });
      }       
   };

   sendResponse(context: Discord.Message, response: string = "", tts: boolean = context.tts, toUser: string = "") {
      if (!response) return;
      if (toUser === "yourself") {
         this.sendMessage(context, `*${response.trim()}*`, tts);
      } else if (toUser !== "") {      
         this.sendMessage(context, `${toUser}: ${response}`, tts);
      } else {
         this.sendMessage(context, response, tts);
      }
   }
   interpolateUsers(context: Discord.Message, message: string = context.content) {
      if (context.guild && context.guild.members) {
         context.guild.members.map(member => {
            if (member.user && !member.user.bot) message = message.replace(`<@${member.user.id}>`, member.user.username)
         });
      }
      return message.replace(`<@${this.client.user.id}>`, this.client.user.username);
   }
   getResponseToInput(context: Discord.Message,
                     input: string = context.content,
                     fromUser: string = this.getUserFromContext(context),       
                     shouldReply: boolean = true,                     
                     seed: string = this.chatbot.brain.getSeedFromText(input)): string {

      let response: string = this.chatbot.processInput(this.interpolateUsers(context, input), shouldReply, seed);
      if (!response) return "";
      if (response.startsWith(':')) response = `${fromUser}${response}`;
      return response.trim();
   }
   getUserFromContext(context: Discord.Message) {
      return (context.member && context.member.nickname) ? context.member.nickname : context.author.username;
   }
   sendMessage(context: Discord.Message, message: string = "", tts: boolean = context.tts) {
      if (!message) return;
      context.channel.send(message, { tts: tts }).catch(reason => log(`Unable to send message: ${reason}`, 'info'));
   }
   loadTriggers(): Trigger[] {
      return [{
         command: /^!tarot/i,
         action: (context: Discord.Message) => {
            getTarotHand().then(image => {
               log(`Sending tarot reading of ${image.byteLength} bytes`);
               let tarot = new Discord.Attachment(image);
               context.channel.send(tarot)
                              .catch(reason => log(`Unable to send message: ${reason}`, 'info'));
            });            
            return { success: true, value: null, haltTriggers: true };
         }
      }, {
         command: /^!save/i,
         action: (context: Discord.Message) => {
            if (this.dirtyBrain) {
               this.sendMessage(context, `saving my brain thanks for the reminder`);
               this.saveDirtyBrain();
            } else {
               this.sendMessage(context, `no`);
            }
            return { success: true, value: null, haltTriggers: true };
         }
      }, {
         command: /^a0l$/i,
         action: (context: Discord.Message) => {
            this.sendMessage(context, a0l(), context.tts);      
            return { success: true, value: null, haltTriggers: true }
         }
      }, {
         command: /chat(?: with (?<person>.+))?(?: about (?<topic>.+)){1,}/iu,
         action: (context: Discord.Message, matches: RegExpMatchArray = []) => {
            let response: string, toUser: string, fromUser: string, seed: string;
      
            fromUser = this.getUserFromContext(context);
            toUser = ((matches.groups && matches.groups.person) ? matches.groups.person.trim() : '').toLowerCase();
            if (!toUser || toUser === 'me') toUser = fromUser;  
            seed = (matches.groups && matches.groups.topic) ? this.chatbot.brain.getSeedFromText(matches.groups.topic.trim()) : this.chatbot.brain.getSeedFromText();
      
            log(`Talking to ${toUser} about ${seed}`, 'bot-message');
      
            this.conversations[toUser] = {
               lastMessageTime: Date.now(),
               lastTopic: seed
            }
            response = this.getResponseToInput(context, context.content, fromUser, true, seed);
            if (!response) return { success: false, error: 'No response', haltTriggers: false }
            this.sendResponse(context, response, context.tts, toUser);
            
            return { success: true, value: null, haltTriggers: true };
         }   
      }, {
         command: /tell (?<person>.+)? ?(?:a(?:nother)?) (?<long>long)? ?story(?: about (?<topic>.+))?/iu,
         action: (context: Discord.Message, matches: RegExpMatchArray = []) => {
            let fromUser: string, toUser: string, seed: string, currentStoryLine: string;
            
            let storyLength: number = (3 * this.chatbot.settings.responsiveness) + Math.floor(Math.random() * 4);      
      
            fromUser = this.getUserFromContext(context);         
            toUser = ((matches.groups && matches.groups.person) ? matches.groups.person.trim() : '').toLowerCase();
            if (toUser === 'me') toUser = fromUser;  
      
            if (matches.groups && matches.groups.long) storyLength *= 3;
            seed = (matches.groups && matches.groups.topic) ? this.chatbot.brain.getSeedFromText(matches.groups.topic.trim()) : this.chatbot.brain.getSeedFromText();
                  
            let previousStoryLine: string = "";
            let repeatedLine: boolean = false;
      
            log(`Telling ${toUser ? `${toUser} ` : ''}a ${storyLength}-line story about ${seed}`, 'bot-message');
         
            storyLoop:
            for (let lineCounter = 0; lineCounter < storyLength; lineCounter++) {
               let uniqueLine: boolean = true;
      
               repetitionCheck: 
               for (let attempt = 1; attempt <= 5; attempt++) {
                  
                  currentStoryLine = this.chatbot.brain.getReply(seed);
                  if (!currentStoryLine) currentStoryLine = this.chatbot.brain.getReply();            
                  if (!currentStoryLine) {
                     log(`Couldn't get a story started -- nothing matches any seeds. Empty brain?`, 'bot-message');
                     break storyLoop;
                  }
      
                  log(`Line ${lineCounter} (seed: ${seed}): ${currentStoryLine.trim()}`, 'bot-message');                  
                  repeatedLine = previousStoryLine.toLowerCase() === currentStoryLine.toLowerCase();            
      
                  previousStoryLine = currentStoryLine;
                  seed = repeatedLine ? this.chatbot.brain.getSeedFromText() : this.chatbot.brain.getSeedFromText(currentStoryLine);            
               
                  if (repeatedLine) {
                     log(`Line ${lineCounter} is a repeat -- attempting to get a different line using seed ${seed} (attempt #${attempt}).`, 'bot-message');
                     uniqueLine = false;
                  } else {
                     uniqueLine = true;
                     
                     this.sendResponse(context, currentStoryLine, context.tts, toUser);
                     break repetitionCheck;
                  }
               }
      
               if (!uniqueLine) {
                  log(`Unable to retrieve a unique line after 5 attempts. Ending story.`, 'bot-message');
                  lineCounter = storyLength;
                  this.sendMessage(context, `${toUser !== '' ? `${toUser}: ` : ''}***the end***`, context.tts);
                  break storyLoop;
               }
               
            }
            log(`End of story`, 'bot-message');
            return { success: true, value: null, haltTriggers: true };
         }
      }, {
         command: /^talk (?:add|remove|delete|index)/i,
         action: () => { return { success: true, value: null, haltTriggers: true } }
      }, {
         command: /^show conversations/iu,
         action: (context: Discord.Message) => {
            this.sendMessage(context, `\`\`\`json\n${JSON.stringify(this.conversations, null, 2)}\`\`\``, false);
            return { success: true, value: null, haltTriggers: true }
         }
      }, {
         command: /.+/i,
         action: (context: Discord.Message) => {      
            let conversing: boolean = false;
            let message: string = context.content.replace(new RegExp(`^\s*${this.chatbot.respondsTo.source}`, 'ui'), '').trim();
            message = message.replace(new RegExp(this.chatbot.name, 'uig'), 'my friend');
            if (context.content.toUpperCase() == context.content) message = message.toUpperCase();

            let fromUser: string = this.getUserFromContext(context);
            let seed: string = this.chatbot.brain.getSeedFromText(message);
      
            if (context.content.match(this.chatbot.respondsTo)) conversing = true;            
            
            if (conversing) {
               log(`${fromUser} is talking to me about '${seed}'.`, 'bot-message')
               this.conversations[fromUser] = {
                  lastMessageTime: Date.now(),
                  lastTopic: seed
               }
            }
      
            if (!this.conversations[fromUser]) {
               // Learn only, or random outburst
               const response = this.chatbot.processInput(this.interpolateUsers(context, message), false, seed);
               if (!response) return { success: true, value: null, haltTriggers: false }
               this.sendResponse(context, response, context.tts, fromUser);
               return { success: true, value: null, haltTriggers: false }
            }
      
            const timeSinceLastConversation: number = (Date.now() - this.conversations[fromUser].lastMessageTime) / 1000;
            
            if (timeSinceLastConversation > this.chatbot.settings.conversationMemoryLength) {            
               log(`Been too long since last speaking with ${fromUser}, deleting conversation memory`, 'bot-message');
               delete this.conversations[fromUser];
               return { success: true, value: null, haltTriggers: false }
            }
      
            if (timeSinceLastConversation < this.chatbot.settings.conversationTimeLimit) conversing = true;
      
            if (conversing) {
               if (!this.conversations[fromUser].lastTopic) this.conversations[fromUser].lastTopic = seed;
               log(`Conversing with ${fromUser} about ${this.conversations[fromUser].lastTopic} (last message: ${timeSinceLastConversation}s ago)`, 'bot-message');
                  
               const response = this.getResponseToInput(context, message, fromUser, conversing, this.conversations[fromUser].lastTopic);
               if (!response) return { success: false, error: `Unable to return response to ${message}`, haltTriggers: false }
      
               this.conversations[fromUser].lastMessageTime = Date.now();
      
               if (response.toLowerCase() != message.toLowerCase()) {
                  this.sendResponse(context, response, context.tts, fromUser);            
               } else {
                  let alternateResponse = this.chatbot.brain.getReply();
                  this.sendResponse(context, alternateResponse, context.tts, fromUser);
               }
            }        
            
            return { success: true, value: null, haltTriggers: true };
         }
      }];
   }
}

new DiscordBot();