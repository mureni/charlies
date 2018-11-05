import winston from "winston";
import chalk from "chalk";
import { CONFIG } from './charlies.config';

class LogSystem { 
   static readonly logger: winston.Logger = winston.createLogger({
      level: 'info',
      format: winston.format.json(),
      transports: process.env.NODE_ENV !== 'production' ? new winston.transports.Console({
            format: winston.format.simple(),
            level: 'info',
      }) : [
         new winston.transports.File({ filename: CONFIG.errorLog, level: 'error' }),
         new winston.transports.File({ filename: CONFIG.generalLog })
      ]
   });

   static output(message: string = "", type: "info" | "error" | "bot-message" | "message" = "info") {
      let color: Function, logFunc: Function = LogSystem.logger.info;
      switch (type) {      
         case "error": 
            color = chalk.red;
            logFunc = LogSystem.logger.error;
            break;
         case "bot-message":
            color = chalk.magentaBright;
            break;
         case "message":
            color = chalk.blueBright;
            break;
         case "info":
         default: 
            color = chalk.gray;
            break;
      }
      logFunc(color(message));
   }
   
}
const log = LogSystem.output;
export { chalk, log };
export default log;
