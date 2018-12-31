import token from "./.secret-stuff"; /* don't steal this from charlies plz */
export const CONFIG = {
   discord_token: token, 
   killswitch: /^die$/i,
   locale: "en-US",
   errorLog: "./charlies-error.log",
   generalLog: "./charlies-general.log",
   infoLogFormat: (info => `${info.timestamp} [${info.level}]: ${info.label} - ${info.message}`),
   bot: {
      respondsTo: /charlie['s:]*\s*/ui,
      name: 'charlies',
      brain: undefined,
      trainerFile: "./charlies.trn",
      brainFile: "./charlies.brn",
      settings: {         
         outburst: 0.005,
         responsiveness: 1,
         anger: 0.5,
         irritability: 1.2,
         recursion: 1,
         calmdown: 1.5,
         conversationTimeLimit: 3,
         conversationMemoryLength: 600,
      }
   }
}

process.env.NODE_ENV = "development"
