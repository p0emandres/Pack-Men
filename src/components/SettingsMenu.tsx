import { useState, useEffect } from 'react';
import { qualitySettings, type QualityLevel } from '../game/qualitySettings';

interface SettingsMenuProps {
  onLogout?: () => void;
  inline?: boolean; // When true, renders inline (for header integration)
}

// CSS styles for the settings menu
const settingsStyle = `
  @keyframes settingsFadeIn {
    from {
      opacity: 0;
      transform: scale(0.95);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  .settings-button {
    position: fixed;
    top: 10px;
    right: 10px;
    width: 40px;
    height: 40px;
    background: transparent;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
    padding: 0;
  }

  .settings-button-inline {
    position: relative;
    top: auto;
    right: auto;
    width: 24px;
    height: 24px;
    background: transparent;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    z-index: 1001;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
    padding: 0;
    margin-left: 0.5rem;
  }

  .settings-button:hover,
  .settings-button-inline:hover {
    background: rgba(0, 255, 0, 0.15);
  }

  .settings-button svg {
    width: 22px;
    height: 22px;
    fill: rgba(0, 255, 0, 0.8);
    transition: transform 0.3s ease, fill 0.2s ease;
  }

  .settings-button-inline svg {
    width: 18px;
    height: 18px;
    fill: rgba(0, 255, 0, 0.8);
    transition: transform 0.3s ease, fill 0.2s ease;
  }

  .settings-button:hover svg,
  .settings-button-inline:hover svg {
    transform: rotate(30deg);
    fill: #00ff00;
  }

  .settings-panel {
    position: fixed;
    top: 60px;
    right: 10px;
    background: rgba(10, 10, 26, 0.95);
    border: 2px solid rgba(0, 255, 0, 0.4);
    border-radius: 8px;
    padding: 1rem;
    z-index: 9998;
    min-width: 200px;
    animation: settingsFadeIn 0.2s ease-out;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5), 0 0 20px rgba(0, 255, 0, 0.1);
  }

  .settings-panel-inline {
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: 0.5rem;
    background: rgba(10, 10, 26, 0.98);
    border: 2px solid rgba(0, 255, 0, 0.4);
    border-radius: 8px;
    padding: 1rem;
    z-index: 1002;
    min-width: 180px;
    animation: settingsFadeIn 0.2s ease-out;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5), 0 0 20px rgba(0, 255, 0, 0.1);
  }

  .settings-logout-button {
    width: 100%;
    padding: 0.6rem 0.75rem;
    margin-top: 1rem;
    background: rgba(255, 0, 0, 0.1);
    border: 1px solid rgba(255, 0, 0, 0.3);
    border-radius: 4px;
    cursor: pointer;
    font-family: 'Courier New', monospace;
    font-size: 11px;
    color: #ff4444;
    text-transform: uppercase;
    letter-spacing: 1px;
    transition: all 0.15s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
  }

  .settings-logout-button:hover {
    background: rgba(255, 0, 0, 0.2);
    border-color: rgba(255, 0, 0, 0.5);
    color: #ff6666;
    text-shadow: 0 0 5px rgba(255, 0, 0, 0.5);
  }

  .settings-title {
    font-family: 'Courier New', monospace;
    font-size: 12px;
    color: #00ff00;
    text-transform: uppercase;
    letter-spacing: 2px;
    margin-bottom: 1rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid rgba(0, 255, 0, 0.3);
    text-shadow: 0 0 5px rgba(0, 255, 0, 0.5);
  }

  .settings-label {
    font-family: 'Courier New', monospace;
    font-size: 10px;
    color: rgba(0, 255, 0, 0.7);
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 0.5rem;
  }

  .quality-options {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .quality-option {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem 0.75rem;
    background: rgba(0, 0, 0, 0.4);
    border: 1px solid rgba(0, 255, 0, 0.2);
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .quality-option:hover {
    background: rgba(0, 255, 0, 0.1);
    border-color: rgba(0, 255, 0, 0.4);
  }

  .quality-option.selected {
    background: rgba(0, 255, 0, 0.15);
    border-color: rgba(0, 255, 0, 0.6);
    box-shadow: 0 0 10px rgba(0, 255, 0, 0.2);
  }

  .quality-radio {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(0, 255, 0, 0.5);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .quality-radio-inner {
    width: 6px;
    height: 6px;
    background: #00ff00;
    border-radius: 50%;
    opacity: 0;
    transition: opacity 0.15s ease;
  }

  .quality-option.selected .quality-radio-inner {
    opacity: 1;
  }

  .quality-label {
    font-family: 'Courier New', monospace;
    font-size: 11px;
    color: rgba(0, 255, 0, 0.8);
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .quality-option.selected .quality-label {
    color: #00ff00;
    text-shadow: 0 0 5px rgba(0, 255, 0, 0.5);
  }

  .quality-description {
    font-family: 'Courier New', monospace;
    font-size: 8px;
    color: rgba(0, 255, 0, 0.5);
    margin-top: 0.25rem;
  }

  .settings-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 9997;
  }
`;

interface QualityOption {
  level: QualityLevel;
  label: string;
  description: string;
}

const qualityOptions: QualityOption[] = [
  { level: 'low', label: 'Low', description: 'Best performance' },
  { level: 'medium', label: 'Medium', description: 'Balanced' },
  { level: 'high', label: 'High', description: 'Best quality' },
];

/**
 * Settings menu component for quality settings.
 * Displays a gear icon button that opens a panel with quality presets.
 */
export function SettingsMenu({ onLogout, inline = false }: SettingsMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentLevel, setCurrentLevel] = useState<QualityLevel>(qualitySettings.getLevel());

  // Subscribe to quality changes (in case changed elsewhere)
  useEffect(() => {
    const unsubscribe = qualitySettings.subscribe((level) => {
      setCurrentLevel(level);
    });
    return unsubscribe;
  }, []);

  const handleQualityChange = (level: QualityLevel) => {
    qualitySettings.setLevel(level);
    setCurrentLevel(level);
  };

  const togglePanel = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(!isOpen);
  };

  const closePanel = () => {
    setIsOpen(false);
  };

  const handleLogout = () => {
    closePanel();
    onLogout?.();
  };

  const buttonClass = inline ? 'settings-button-inline' : 'settings-button';
  const panelClass = inline ? 'settings-panel-inline' : 'settings-panel';

  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <style>{settingsStyle}</style>
      
      {/* Gear Icon Button */}
      <button 
        className={buttonClass}
        onClick={togglePanel}
        title="Settings"
        aria-label="Open settings"
      >
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
        </svg>
      </button>

      {/* Backdrop to close panel when clicking outside */}
      {isOpen && !inline && (
        <div className="settings-backdrop" onClick={closePanel} />
      )}
      {isOpen && inline && (
        <div 
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000 }} 
          onClick={closePanel} 
        />
      )}

      {/* Settings Panel */}
      {isOpen && (
        <div className={panelClass}>
          <div className="settings-title">Settings</div>
          <div className="settings-label">Graphics Preset</div>
          <div className="quality-options">
            {qualityOptions.map((option) => (
              <div
                key={option.level}
                className={`quality-option ${currentLevel === option.level ? 'selected' : ''}`}
                onClick={() => handleQualityChange(option.level)}
              >
                <div className="quality-radio">
                  <div className="quality-radio-inner" />
                </div>
                <div>
                  <div className="quality-label">{option.label}</div>
                  <div className="quality-description">{option.description}</div>
                </div>
              </div>
            ))}
          </div>
          
          {/* Logout Button */}
          {onLogout && (
            <button className="settings-logout-button" onClick={handleLogout}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/>
              </svg>
              Log Out
            </button>
          )}
        </div>
      )}
    </div>
  );
}
