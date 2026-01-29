import * as THREE from 'three';

export interface BuildingInfo {
    name: string;
    position: THREE.Vector3;
    rotation: number; // Y-axis rotation in radians
    scale: number;
    boundingBox?: THREE.Box3;
    footprint?: {
        width: number;
        depth: number;
        area: number;
        corners: THREE.Vector3[];
    };
}

export class BuildingTracker {
    private buildings: Map<string, BuildingInfo[]> = new Map();
    
    /**
     * Register a building with its information
     */
    registerBuilding(
        name: string,
        position: THREE.Vector3,
        rotation: number,
        scale: number = 8,
        boundingBox?: THREE.Box3
    ): void {
        if (!this.buildings.has(name)) {
            this.buildings.set(name, []);
        }
        
        const buildingInfo: BuildingInfo = {
            name,
            position: position.clone(),
            rotation,
            scale,
            boundingBox: boundingBox?.clone(),
        };
        
        this.buildings.get(name)!.push(buildingInfo);
    }
    
    /**
     * Calculate footprint area for a building after it's loaded
     */
    calculateFootprint(building: THREE.Group, buildingInfo: BuildingInfo): void {
        const box = new THREE.Box3().setFromObject(building);
        const size = box.getSize(new THREE.Vector3());
        
        // The bounding box already accounts for rotation, so use size directly
        const width = size.x;
        const depth = size.z;
        const area = width * depth;
        
        // Calculate footprint corners in local space (before rotation)
        // We need to get the corners of the bounding box in world space
        const min = box.min;
        const max = box.max;
        
        // Get the 4 corners of the bottom face of the bounding box
        const corners = [
            new THREE.Vector3(min.x, min.y, min.z), // Bottom-left
            new THREE.Vector3(max.x, min.y, min.z), // Bottom-right
            new THREE.Vector3(max.x, min.y, max.z), // Top-right
            new THREE.Vector3(min.x, min.y, max.z), // Top-left
        ];
        
        // The bounding box is already in world space, so corners are correct
        // But we want to use the building's Y position for the footprint
        corners.forEach(corner => {
            corner.y = buildingInfo.position.y;
        });
        
        buildingInfo.footprint = {
            width,
            depth,
            area,
            corners,
        };
        
        buildingInfo.boundingBox = box;
    }
    
    /**
     * Get all buildings
     */
    getAllBuildings(): BuildingInfo[] {
        const allBuildings: BuildingInfo[] = [];
        this.buildings.forEach(buildingList => {
            allBuildings.push(...buildingList);
        });
        return allBuildings;
    }
    
    /**
     * Get buildings by name
     */
    getBuildingsByName(name: string): BuildingInfo[] {
        return this.buildings.get(name) || [];
    }
    
    /**
     * Print building information to console
     */
    printBuildingInfo(): void {
        console.log('\n=== BUILDING POSITIONS AND AREAS ===\n');
        
        const allBuildings = this.getAllBuildings();
        allBuildings.sort((a, b) => {
            // Sort by distance from origin
            const distA = a.position.length();
            const distB = b.position.length();
            return distA - distB;
        });
        
        allBuildings.forEach((building, index) => {
            const rotationDeg = (building.rotation * 180) / Math.PI;
            console.log(`${index + 1}. ${building.name}`);
            console.log(`   Position: (${building.position.x.toFixed(2)}, ${building.position.y.toFixed(2)}, ${building.position.z.toFixed(2)})`);
            console.log(`   Rotation: ${rotationDeg.toFixed(1)}°`);
            console.log(`   Scale: ${building.scale}x`);
            
            if (building.footprint) {
                console.log(`   Footprint: ${building.footprint.width.toFixed(2)} × ${building.footprint.depth.toFixed(2)} units`);
                console.log(`   Area: ${building.footprint.area.toFixed(2)} square units`);
                console.log(`   Corners:`);
                building.footprint.corners.forEach((corner, i) => {
                    console.log(`     ${i + 1}. (${corner.x.toFixed(2)}, ${corner.z.toFixed(2)})`);
                });
            } else if (building.boundingBox) {
                const size = building.boundingBox.getSize(new THREE.Vector3());
                console.log(`   Bounding Box: ${size.x.toFixed(2)} × ${size.z.toFixed(2)} × ${size.y.toFixed(2)} units`);
                console.log(`   Estimated Area: ${(size.x * size.z).toFixed(2)} square units`);
            }
            console.log('');
        });
        
        // Summary statistics
        const totalArea = allBuildings.reduce((sum, b) => {
            return sum + (b.footprint?.area || (b.boundingBox ? 
                (() => { const s = b.boundingBox!.getSize(new THREE.Vector3()); return s.x * s.z; })() : 0));
        }, 0);
        
        console.log(`Total Buildings: ${allBuildings.length}`);
        console.log(`Total Footprint Area: ${totalArea.toFixed(2)} square units\n`);
    }
    
    /**
     * Export building data as JSON
     */
    exportToJSON(): string {
        const allBuildings = this.getAllBuildings();
        const exportData = allBuildings.map(building => ({
            name: building.name,
            position: {
                x: building.position.x,
                y: building.position.y,
                z: building.position.z,
            },
            rotation: building.rotation,
            rotationDegrees: (building.rotation * 180) / Math.PI,
            scale: building.scale,
            footprint: building.footprint ? {
                width: building.footprint.width,
                depth: building.footprint.depth,
                area: building.footprint.area,
                corners: building.footprint.corners.map(c => ({ x: c.x, y: c.y, z: c.z })),
            } : null,
            boundingBox: building.boundingBox ? {
                min: {
                    x: building.boundingBox.min.x,
                    y: building.boundingBox.min.y,
                    z: building.boundingBox.min.z,
                },
                max: {
                    x: building.boundingBox.max.x,
                    y: building.boundingBox.max.y,
                    z: building.boundingBox.max.z,
                },
                size: (() => {
                    const size = building.boundingBox!.getSize(new THREE.Vector3());
                    return { x: size.x, y: size.y, z: size.z };
                })(),
            } : null,
        }));
        
        return JSON.stringify(exportData, null, 2);
    }
}
