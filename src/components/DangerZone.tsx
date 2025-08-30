/**
 * DangerZone Component
 * Provides deactivation controls with destructive styling
 */

'use client';

import React, { useState } from 'react';
import { AlertTriangle, Shield, X } from 'lucide-react';
import { ConfirmationModal } from './ConfirmationModal';

export function DangerZone() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleDeactivateClick = () => {
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  return (
    <>
      <div className="bg-red-500/5 border-2 border-red-500/30 rounded-xl p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-red-500/20 rounded-lg">
            <AlertTriangle className="h-5 w-5 text-red-400" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-red-400">Danger Zone</h2>
            <p className="text-red-300 text-sm">
              Irreversible actions that will affect your trading bot
            </p>
          </div>
        </div>

        {/* Warning Content */}
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <Shield className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-red-400 font-medium mb-2">Before You Continue</h3>
              <ul className="text-red-300 text-sm space-y-1">
                <li>• This action will immediately stop all automated trading</li>
                <li>• Your vault funds will remain safe and accessible to you</li>
                <li>• Bot permissions will be permanently revoked</li>
                <li>• You can re-authorize the bot later by going through setup again</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Action Section */}
        <div className="space-y-4">
          <div>
            <h3 className="text-white font-medium mb-2">Bot Deactivation</h3>
            <p className="text-gray-300 text-sm mb-4">
              Deactivate your trading bot and revoke all permissions. This will stop 
              automated trading immediately and remove the bot&apos;s access to your vault.
            </p>
          </div>

          <button
            onClick={handleDeactivateClick}
            className="w-full sm:w-auto px-6 py-3 bg-red-600 hover:bg-red-700 
                     text-white font-medium rounded-lg border-2 border-red-500
                     transition-all duration-200 hover:border-red-400
                     focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2
                     focus:ring-offset-gray-900
                     flex items-center justify-center gap-2"
          >
            <X className="h-4 w-4" />
            Deactivate Bot & Revoke Permissions
          </button>
        </div>

        {/* Additional Warning */}
        <div className="mt-6 pt-4 border-t border-red-500/20">
          <p className="text-xs text-red-400/70">
            ⚠️ This action requires a blockchain transaction and cannot be undone without 
            completing the full authorization process again.
          </p>
        </div>
      </div>

      {/* Confirmation Modal */}
      <ConfirmationModal 
        isOpen={isModalOpen} 
        onClose={handleCloseModal} 
      />
    </>
  );
}