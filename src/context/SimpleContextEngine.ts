/**
 * Simple Context Engine
 * Just detects phases and formats to XML - no recommendations or analysis
 */

export class SimpleContextEngine {
  /**
   * Detect game phase from state
   */
  detectPhase(gameState: any): string {
    if (!gameState.adventurer?.health || gameState.adventurer.health <= 0) {
      return 'death';
    }
    if (gameState.currentBeast) {
      return 'combat';
    }
    if (gameState.adventurer?.statUpgradesAvailable > 0) {
      return 'level_up';
    }
    // Market is always available during exploration
    return 'exploration';
  }

  /**
   * Build simple XML context based on phase
   */
  build(gameState: any): { content: string; phase: string; tokens: number } {
    const phase = this.detectPhase(gameState);
    let content = '';

    switch (phase) {
      case 'death':
        content = this.buildDeathContext(gameState);
        break;
      case 'combat':
        content = this.buildCombatContext(gameState);
        break;
      case 'level_up':
        content = this.buildLevelUpContext(gameState);
        break;
      default:
        // Exploration includes market
        content = this.buildExplorationContext(gameState);
    }

    return {
      content,
      phase,
      tokens: Math.ceil(content.length / 4)
    };
  }

  private buildDeathContext(gameState: any): string {
    const { adventurer } = gameState;
    return `<context>
  <phase>death</phase>
  <level>${adventurer?.level || 1}</level>
  <xp>${adventurer?.xp || 0}</xp>
  <gold>${adventurer?.gold || 0}</gold>
</context>`;
  }

  private buildCombatContext(gameState: any): string {
    const { adventurer, currentBeast, damagePreview } = gameState;
    const eq = adventurer?.equipment || {};
    
    // Format equipment as attributes with name, level, tier
    const formatEquip = (item: any) => {
      if (!item?.name || item.name === 'None') return 'None';
      return `${item.name}:L${item.level || 1}:T${item.tier || 0}`;
    };

    return `<context>
  <phase>combat</phase>
  <adventurer health="${adventurer?.health || 0}" level="${adventurer?.level || 1}" gold="${adventurer?.gold || 0}" xp="${adventurer?.xp || 0}"/>
  <stats str="${adventurer?.stats?.strength || 0}" dex="${adventurer?.stats?.dexterity || 0}" vit="${adventurer?.stats?.vitality || 0}" int="${adventurer?.stats?.intelligence || 0}" wis="${adventurer?.stats?.wisdom || 0}" cha="${adventurer?.stats?.charisma || 0}"/>
  <equipment weapon="${formatEquip(eq.weapon)}" chest="${formatEquip(eq.chest)}" head="${formatEquip(eq.head)}" waist="${formatEquip(eq.waist)}" foot="${formatEquip(eq.foot)}" hand="${formatEquip(eq.hand)}" neck="${formatEquip(eq.neck)}" ring="${formatEquip(eq.ring)}"/>
  <beast name="${currentBeast?.name || 'Unknown'}" health="${currentBeast?.health || 0}" level="${currentBeast?.level || 1}" tier="${currentBeast?.tier || 0}"/>
  <damage player="${damagePreview?.baseDamage || 0}" critical="${damagePreview?.criticalDamage || 0}" beast="${damagePreview?.incoming?.maxDamage || 0}"/>
</context>`;
  }


  private buildLevelUpContext(gameState: any): string {
    const { adventurer } = gameState;
    return `<context>
  <phase>level_up</phase>
  <level>${adventurer?.level || 1}</level>
  <points>${adventurer?.statUpgradesAvailable || 0}</points>
  <stats>
    <str>${adventurer?.stats?.strength || 0}</str>
    <dex>${adventurer?.stats?.dexterity || 0}</dex>
    <vit>${adventurer?.stats?.vitality || 0}</vit>
    <int>${adventurer?.stats?.intelligence || 0}</int>
    <wis>${adventurer?.stats?.wisdom || 0}</wis>
    <cha>${adventurer?.stats?.charisma || 0}</cha>
  </stats>
</context>`;
  }

  private buildExplorationContext(gameState: any): string {
    const { adventurer, market } = gameState;
    const gold = adventurer?.gold || 0;
    const eq = adventurer?.equipment || {};
    
    // Format equipment as attributes with name, level, tier
    const formatEquip = (item: any) => {
      if (!item?.name || item.name === 'None') return 'None';
      return `${item.name}:L${item.level || 1}:T${item.tier || 0}`;
    };
    
    // Get all affordable items as compact list
    const affordableItems = (market || [])
      .filter((item: any) => item.price <= gold)
      .map((item: any) => `  <item name="${item.name}" price="${item.price}" tier="${item.tier || 0}" slot="${item.slot || ''}" type="${item.type || ''}"/>`)
      .join('\n');

    return `<context>
  <phase>exploration</phase>
  <adventurer health="${adventurer?.health || 0}" level="${adventurer?.level || 1}" gold="${gold}" xp="${adventurer?.xp || 0}"/>
  <stats str="${adventurer?.stats?.strength || 0}" dex="${adventurer?.stats?.dexterity || 0}" vit="${adventurer?.stats?.vitality || 0}" int="${adventurer?.stats?.intelligence || 0}" wis="${adventurer?.stats?.wisdom || 0}" cha="${adventurer?.stats?.charisma || 0}"/>
  <equipment weapon="${formatEquip(eq.weapon)}" chest="${formatEquip(eq.chest)}" head="${formatEquip(eq.head)}" waist="${formatEquip(eq.waist)}" foot="${formatEquip(eq.foot)}" hand="${formatEquip(eq.hand)}" neck="${formatEquip(eq.neck)}" ring="${formatEquip(eq.ring)}"/>
  <market>
${affordableItems || '    <!-- No affordable items -->'}
  </market>
</context>`;
  }
}