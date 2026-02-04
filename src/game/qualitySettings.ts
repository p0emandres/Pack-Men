import * as THREE from 'three';

/**
 * Quality preset levels for performance optimization.
 */
export type QualityLevel = 'low' | 'medium' | 'high';

/**
 * Quality settings configuration.
 */
export interface QualityConfig {
  // Shadow settings
  shadowMapSize: number;
  shadowMapType: THREE.ShadowMapType;
  enablePointLightShadows: boolean;
  maxShadowCastingLights: number;
  
  // Ground tile settings
  tileSpacing: number; // Higher = fewer tiles
  
  // Renderer settings
  maxPixelRatio: number;
  antialias: boolean;
  
  // Object shadow settings
  plantsCastShadow: boolean;
  distantBuildingsCastShadow: boolean;
  
  // Texture settings
  textureAnisotropy: number; // 1 = disabled, 4/8/16 = quality levels
}

/**
 * Quality presets for Low, Medium, and High settings.
 * Note: Pixel ratio values were increased to prevent blocky textures on buildings/characters.
 * The previous values (1.0, 1.5, 2.0) caused visible pixelation especially on high-DPI displays.
 */
export const QUALITY_PRESETS: Record<QualityLevel, QualityConfig> = {
  low: {
    shadowMapSize: 512,
    shadowMapType: THREE.BasicShadowMap,
    enablePointLightShadows: false,
    maxShadowCastingLights: 1,
    tileSpacing: 4, // 75x75 = 5,625 tiles
    maxPixelRatio: 1.5, // Increased from 1.0 to prevent blocky textures
    antialias: true, // Enabled to reduce aliasing on model edges
    plantsCastShadow: false,
    distantBuildingsCastShadow: false,
    textureAnisotropy: 4, // Basic anisotropic filtering
  },
  medium: {
    shadowMapSize: 1024,
    shadowMapType: THREE.PCFShadowMap,
    enablePointLightShadows: true,
    maxShadowCastingLights: 4,
    tileSpacing: 2, // 150x150 = 22,500 tiles
    maxPixelRatio: 2.0, // Increased from 1.5 to match native resolution on most displays
    antialias: true,
    plantsCastShadow: false,
    distantBuildingsCastShadow: true,
    textureAnisotropy: 8, // Good quality anisotropic filtering
  },
  high: {
    shadowMapSize: 2048,
    shadowMapType: THREE.PCFSoftShadowMap,
    enablePointLightShadows: true,
    maxShadowCastingLights: 10,
    tileSpacing: 2, // 150x150 = 22,500 tiles
    maxPixelRatio: 3.0, // Increased from 2.0 to support high-DPI displays (Retina, 4K)
    antialias: true,
    plantsCastShadow: true,
    distantBuildingsCastShadow: true,
    textureAnisotropy: 16, // Maximum anisotropic filtering for best texture quality
  },
};

const STORAGE_KEY = 'droog_quality_settings';

/**
 * Type for quality change event listeners.
 */
type QualityChangeListener = (level: QualityLevel, config: QualityConfig) => void;

/**
 * Quality Settings Store - manages user quality preferences with localStorage persistence.
 */
class QualitySettingsStore {
  private currentLevel: QualityLevel;
  private listeners: Set<QualityChangeListener> = new Set();

  constructor() {
    this.currentLevel = this.loadFromStorage();
  }

  /**
   * Load quality level from localStorage, defaulting to 'medium'.
   */
  private loadFromStorage(): QualityLevel {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && (stored === 'low' || stored === 'medium' || stored === 'high')) {
        return stored as QualityLevel;
      }
    } catch (e) {
    }
    return 'medium'; // Default
  }

  /**
   * Save quality level to localStorage.
   */
  private saveToStorage(level: QualityLevel): void {
    try {
      localStorage.setItem(STORAGE_KEY, level);
    } catch (e) {
    }
  }

  /**
   * Get the current quality level.
   */
  getLevel(): QualityLevel {
    return this.currentLevel;
  }

  /**
   * Get the current quality configuration.
   */
  getConfig(): QualityConfig {
    return QUALITY_PRESETS[this.currentLevel];
  }

  /**
   * Set the quality level and notify listeners.
   */
  setLevel(level: QualityLevel): void {
    if (this.currentLevel === level) return;
    
    this.currentLevel = level;
    this.saveToStorage(level);
    
    const config = this.getConfig();
    this.listeners.forEach(listener => {
      try {
        listener(level, config);
      } catch (e) {
      }
    });
  }

  /**
   * Subscribe to quality changes.
   * Returns an unsubscribe function.
   */
  subscribe(listener: QualityChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Get a specific preset configuration.
   */
  getPreset(level: QualityLevel): QualityConfig {
    return QUALITY_PRESETS[level];
  }
}

// Singleton instance
export const qualitySettings = new QualitySettingsStore();

/**
 * Apply quality settings to a THREE.WebGLRenderer.
 * Note: Some settings (like antialias) require renderer recreation.
 */
export function applyRendererSettings(
  renderer: THREE.WebGLRenderer,
  config: QualityConfig
): void {
  // Set pixel ratio
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, config.maxPixelRatio));
  
  // Set shadow map type (this can be changed at runtime)
  renderer.shadowMap.type = config.shadowMapType;
  
  // Force shadow map update
  renderer.shadowMap.needsUpdate = true;
  
}

/**
 * Apply quality settings to a directional light's shadow.
 */
export function applyDirectionalLightShadow(
  light: THREE.DirectionalLight,
  config: QualityConfig
): void {
  light.shadow.mapSize.width = config.shadowMapSize;
  light.shadow.mapSize.height = config.shadowMapSize;
  
  // Shadow bias settings to prevent shadow acne (block-like artifacts on surfaces)
  // bias: Negative value prevents surfaces from shadowing themselves
  //       Larger frustum requires larger bias (city scene frustum is 320x320 units)
  // normalBias: Offsets shadow along surface normal, helps with angled surfaces
  //       This is scale-invariant and generally safer than depth bias
  light.shadow.bias = -0.002;
  light.shadow.normalBias = 0.1;
  
  // Force shadow map regeneration
  if (light.shadow.map) {
    light.shadow.map.dispose();
    light.shadow.map = null;
  }
}

/**
 * Apply quality settings to a point light's shadow.
 */
export function applyPointLightShadow(
  light: THREE.PointLight,
  config: QualityConfig,
  lightIndex: number
): void {
  // Enable/disable shadows based on quality and light index
  light.castShadow = config.enablePointLightShadows && lightIndex < config.maxShadowCastingLights;
  
  if (light.castShadow) {
    // Use lower resolution for point lights
    const pointLightShadowSize = Math.min(config.shadowMapSize, 512);
    light.shadow.mapSize.width = pointLightShadowSize;
    light.shadow.mapSize.height = pointLightShadowSize;
    
    // Force shadow map regeneration
    if (light.shadow.map) {
      light.shadow.map.dispose();
      light.shadow.map = null;
    }
  }
}

/**
 * Apply texture quality settings to a loaded 3D object.
 * This improves texture filtering to prevent blocky/pixelated appearance.
 * Should be called after loading a GLTF model.
 */
export function applyTextureQuality(
  object: THREE.Object3D,
  renderer: THREE.WebGLRenderer,
  config?: QualityConfig
): void {
  const qualityConfig = config || qualitySettings.getConfig();
  
  // Get the maximum anisotropy supported by the GPU, capped by quality setting
  const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
  const anisotropy = Math.min(qualityConfig.textureAnisotropy, maxAnisotropy);
  
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      
      for (const material of materials) {
        if (!material) continue;
        
        // Apply anisotropic filtering to all texture maps
        const textureProperties: (keyof THREE.MeshStandardMaterial)[] = [
          'map',
          'normalMap',
          'roughnessMap',
          'metalnessMap',
          'aoMap',
          'emissiveMap',
          'bumpMap',
          'displacementMap',
        ];
        
        for (const prop of textureProperties) {
          const texture = (material as THREE.MeshStandardMaterial)[prop] as THREE.Texture | null;
          if (texture) {
            // Set anisotropic filtering for sharper textures at oblique angles
            texture.anisotropy = anisotropy;
            
            // Ensure proper mipmap filtering (prevents blocky textures)
            // LinearMipmapLinearFilter = trilinear filtering (best quality)
            texture.minFilter = THREE.LinearMipmapLinearFilter;
            texture.magFilter = THREE.LinearFilter;
            
            // Ensure mipmaps are generated
            texture.generateMipmaps = true;
            
            // Mark texture as needing update
            texture.needsUpdate = true;
          }
        }
      }
    }
  });
}
