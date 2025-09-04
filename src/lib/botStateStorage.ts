/**
 * Simple bot state storage for development/testing
 * Uses localStorage for persistence since database is not available
 */

interface BotState {
  walletAddress: string;
  enabled: boolean;
  lastUpdated: string;
}

const BOT_STATE_KEY = 'xorj_bot_states';

export class BotStateStorage {
  
  static getBotState(walletAddress: string): { enabled: boolean; lastUpdated: string } {
    if (typeof window === 'undefined') {
      // Server-side: default to DISABLED for new users
      return { enabled: false, lastUpdated: new Date().toISOString() };
    }

    try {
      const states = localStorage.getItem(BOT_STATE_KEY);
      if (!states) {
        // Default to DISABLED for new users - they must explicitly enable the bot
        return { enabled: false, lastUpdated: new Date().toISOString() };
      }

      const parsedStates: Record<string, BotState> = JSON.parse(states);
      const state = parsedStates[walletAddress];
      
      if (!state) {
        // Default to DISABLED for new users - they must explicitly enable the bot
        return { enabled: false, lastUpdated: new Date().toISOString() };
      }

      return {
        enabled: state.enabled,
        lastUpdated: state.lastUpdated
      };
    } catch (error) {
      console.error('Error reading bot state:', error);
      // Default to DISABLED for new users - they must explicitly enable the bot
      return { enabled: false, lastUpdated: new Date().toISOString() };
    }
  }

  static setBotState(walletAddress: string, enabled: boolean): void {
    if (typeof window === 'undefined') {
      // Server-side: can't persist, log the change
      console.log(`🤖 Bot state would be set: ${walletAddress} = ${enabled ? 'ENABLED' : 'DISABLED'}`);
      return;
    }

    try {
      const states = localStorage.getItem(BOT_STATE_KEY);
      const parsedStates: Record<string, BotState> = states ? JSON.parse(states) : {};
      
      parsedStates[walletAddress] = {
        walletAddress,
        enabled,
        lastUpdated: new Date().toISOString()
      };

      localStorage.setItem(BOT_STATE_KEY, JSON.stringify(parsedStates));
      console.log(`✅ Bot state persisted: ${walletAddress} = ${enabled ? 'ENABLED' : 'DISABLED'}`);
    } catch (error) {
      console.error('Error saving bot state:', error);
    }
  }

  static getAllStates(): Record<string, BotState> {
    if (typeof window === 'undefined') {
      return {};
    }

    try {
      const states = localStorage.getItem(BOT_STATE_KEY);
      return states ? JSON.parse(states) : {};
    } catch (error) {
      console.error('Error reading all bot states:', error);
      return {};
    }
  }
}

// Server-side bot state storage using simple in-memory storage
// This will work for the current session but won't persist across server restarts
const serverBotStates: Record<string, { enabled: boolean; lastUpdated: string }> = {};

export class ServerBotStateStorage {
  
  static getBotState(walletAddress: string): { enabled: boolean; lastUpdated: string } {
    const state = serverBotStates[walletAddress];
    if (!state) {
      // Default to DISABLED for new users - they must explicitly enable the bot
      return { enabled: false, lastUpdated: new Date().toISOString() };
    }
    return state;
  }

  static setBotState(walletAddress: string, enabled: boolean): void {
    serverBotStates[walletAddress] = {
      enabled,
      lastUpdated: new Date().toISOString()
    };
    console.log(`✅ Server bot state set: ${walletAddress} = ${enabled ? 'ENABLED' : 'DISABLED'}`);
  }

  static getAllStates(): Record<string, { enabled: boolean; lastUpdated: string }> {
    return { ...serverBotStates };
  }
}

// Server-side user settings storage using simple in-memory storage
const serverUserSettings: Record<string, { riskProfile: string; lastUpdated: string }> = {};

export class ServerUserSettingsStorage {
  
  static getUserSettings(walletAddress: string): { riskProfile: string; lastUpdated: string } {
    const settings = serverUserSettings[walletAddress];
    if (!settings) {
      return { riskProfile: 'Balanced', lastUpdated: new Date().toISOString() };
    }
    return settings;
  }

  static setUserSettings(walletAddress: string, riskProfile: string): void {
    serverUserSettings[walletAddress] = {
      riskProfile,
      lastUpdated: new Date().toISOString()
    };
    console.log(`✅ Server user settings set: ${walletAddress} riskProfile = ${riskProfile}`);
  }

  static getAllSettings(): Record<string, { riskProfile: string; lastUpdated: string }> {
    return { ...serverUserSettings };
  }
}