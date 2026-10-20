// ==UserScript==
// @name        IRC/Shoutbox Beautifier for The Lounge (azstrait fork)
// @description Integrates shoutbox messages into IRC nicer
// @homepageURL https://aither.cc/forums/topics/3699
// @namespace   https://greasyfork.org/en/users/1566044
// @version     0.11
// @author      azstrait
// @grant       none
// @require     https://cdn.rawgit.com/skepticfx/wshook/master/wsHook.js#sha384-aaWkmlqrYEP/tInyex1lIz/rOsEE78R22SPvL5zyHv9tp5tTXkPqUldGsTGKDy0t
// @run-at      document-start
// @match       https://irc.shaffer.network/*
// @match       https://irc.azstrait.cc/*
// @icon        https://thelounge.chat/favicon.ico
// @license     MIT
// @downloadURL https://update.greasyfork.org/scripts/566668/IRCShoutbox%20Beautifier%20for%20The%20Lounge%20%28azstrait%20fork%29.user.js
// @updateURL   https://update.greasyfork.org/scripts/566668/IRCShoutbox%20Beautifier%20for%20The%20Lounge%20%28azstrait%20fork%29.meta.js
// ==/UserScript==

const messageRegex = /\d+\["(.*?)",(.*)\]/;
const chatbotUserSbRegex = /\[(.*?)\].*? (.*)$/;
const hunobotUserSbRegex = /\»(.*?)\«.*? (.*)$/;
const walleUserSbRegex = /\[Chatbox\].*? (.*?)\: (.*)$/;
const bbotUserSbRegex = /(.*?):.*? (.*)$/;
const aurabotUserSbRegex = /\[04(.*?)11\].*? (.*)$/;
const endorUserSbRegex = /\<(.*?)\>.*? (.*)$/;
const sauronUserSbRegex = / \[02 SB00 ] \((.*?)\):.*? (.*)$/;

wsHook.after = function (messageEvent, url, wsObject) {
    if(messageEvent.data === undefined) {
        return messageEvent;
    }

    let parsedMessage = messageEvent.data.match(messageRegex);

    if(parsedMessage === null) {
        return messageEvent;
    }

    // swap SB messages when scrolling up/down
    if(parsedMessage[1] === "more") {
        let more = JSON.parse(parsedMessage[2]);

        more.messages.forEach((message) => {
            var modifiedMessage = ParseMessage(message);

            if(modifiedMessage) {
                message = modifiedMessage;
            }
        });

        messageEvent.data = "42[\"more\"," + JSON.stringify(more) + "]";
    }

    //swap SB message on page load
    if(parsedMessage[1] === "init") {
        let init = JSON.parse(parsedMessage[2]);
        init.networks.forEach((network) => {
            network.channels.forEach((channel) => {
                channel.messages.forEach((message) => {
                    var modifiedMessage = ParseMessage(message);
                    if(modifiedMessage) {
                        message = modifiedMessage;
                    }
                });
            });
        });

        messageEvent.data = "42[\"init\"," + JSON.stringify(init) + "]";
    }

    // swap SB messages after page load
    if(parsedMessage[1] === "msg") {
        let message = JSON.parse(parsedMessage[2]);
        var modifiedMessage = ParseMessage(message.msg);

        if(modifiedMessage) {
            message.msg = modifiedMessage;
            messageEvent.data = "42[\"msg\"," + JSON.stringify(message) + "]";
        }
    }

    return messageEvent;
}

function ParseMessage(message) {
    if(message.type === "message" && ( message.from.nick === "Chatbot" || message.from.nick === "Bot" || message.from.nick === "ULCX" || message.from.nick === "bridgebot" || message.from.nick === "+bridgebot" || message.from.nick === "darkpeers" || message.from.nick === "Luminarr" )) {
        let chatbotSbUserMessage = message.text.match(chatbotUserSbRegex);

        if(chatbotSbUserMessage !== null) {
            message.from.nick = chatbotSbUserMessage[1];
            message.from.mode = "";
            message.text = chatbotSbUserMessage[2];
        }
        else {
            return false;
        }
    }

    else if(message.type === "message" && message.from.nick === "Mellos") {
        let hunobotSbUserMessage = message.text.match(hunobotUserSbRegex);

        if(hunobotSbUserMessage !== null) {
            message.from.nick = hunobotSbUserMessage[1];
            message.from.mode = "";
            message.text = hunobotSbUserMessage[2];
        }
        else {
            return false;
        }
    }

    else if(message.type === "message" && message.from.nick === "WALL-E") {
        let walleSbUserMessage = message.text.match(walleUserSbRegex);

        if(walleSbUserMessage !== null) {
            message.from.nick = walleSbUserMessage[1];
            message.from.mode = "";
            message.text = walleSbUserMessage[2];
        }
        else {
            return false;
        }
    }

    else if(message.type === "message" && message.from.nick === "BBot") {
        let bbotSbUserMessage = message.text.match(bbotUserSbRegex);

        if(bbotSbUserMessage !== null) {
            message.from.nick = bbotSbUserMessage[1];
            message.from.mode = "";
            message.text = bbotSbUserMessage[2];
        }
        else {
            return false;
        }
    }

    else if(message.type === "message" && message.from.nick === "AuraRelay" ) {
        let aurabotSbUserMessage = message.text.match(aurabotUserSbRegex);

        if(aurabotSbUserMessage !== null) {
            message.from.nick = aurabotSbUserMessage[1];
            message.from.mode = "";
            message.text = aurabotSbUserMessage[2];
        }
        else {
            return false;
        }
    }

    else if(message.type === "message" && ( message.from.nick === "ENDOR" || message.from.nick === "@ENDOR" )) {
        let endorSbUserMessage = message.text.match(endorUserSbRegex);

        if(endorSbUserMessage !== null) {
            message.from.nick = endorSbUserMessage[1];
            message.from.mode = "";
            message.text = endorSbUserMessage[2];
        }
        else {
            return false;
        }
    }

    else if(message.type === "message" && ( message.from.nick === "Sauron" || message.from.nick === "&Sauron" )) {
        let sauronSbUserMessage = message.text.match(sauronUserSbRegex);

        if(sauronSbUserMessage !== null) {
            message.from.nick = sauronSbUserMessage[1];
            message.from.mode = "";
            message.text = sauronSbUserMessage[2];
        }
        else {
            return false;
        }
    }

    else {
        return false;
    }

    return message;
}