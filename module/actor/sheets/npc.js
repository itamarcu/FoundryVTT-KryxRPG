import ActorSheetKryx from "../sheets/base.js";

/**
 * An Actor sheet for NPC type characters in the Kryx RPG system.
 * Extends the base ActorSheetKryx class.
 * @type {ActorSheetKryx}
 */
export default class ActorSheetKryxNPC extends ActorSheetKryx {

  /**
   * Define default rendering options for the NPC sheet
   * @return {Object}
   */
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      classes: ["kryx_rpg", "sheet", "actor", "npc"],
      width: 600,
      height: 700
    });
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */

  /* -------------------------------------------- */

  /**
   * Get the correct HTML template path to use for rendering this particular sheet
   * @type {String}
   */
  get template() {
    if (!game.user.isGM && this.actor.limited) return "systems/kryx_rpg/templates/actors/limited-sheet.html";
    return "systems/kryx_rpg/templates/actors/npc-sheet.html";
  }

  /* -------------------------------------------- */

  /**
   * Organize Owned Items for rendering the NPC sheet
   * @private
   */
  _prepareItems(data) {

    // Categorize Items as Feats/Features and Superpowers
    const features = {
      weapons: {
        label: game.i18n.localize("KRYX_RPG.AttackPl"),
        items: [],
        hasActions: true,
        dataset: {type: "weapon", "weapon-type": "natural"} // NOTE: "weapon-type" will change to "weaponType"
      },
      actions: {
        label: game.i18n.localize("KRYX_RPG.ActionPl"),
        items: [],
        hasActions: true,
        dataset: {type: "feature", "activation.type": "action", type_name: "Feature"}
      },
      passive: {
        label: game.i18n.localize("KRYX_RPG.FeaturePassive"),
        items: [],
        hasActions: false,
        dataset: {type: "feature", type_name: "Feature"}
      },
      inventory: {
        label: game.i18n.localize("KRYX_RPG.Inventory"),
        items: [],
        dataset: {type: "loot"}
      },
    };

    // Start by classifying items into groups for rendering
    let [superpowers, other] = data.items.reduce((arr, item) => {
      item.img = item.img || DEFAULT_TOKEN;
      item.isStack = item.data.quantity ? item.data.quantity > 1 : false;
      item.hasUses = item.data.uses && (item.data.uses.max > 0);
      item.isOnCooldown = item.data.recharge && !!item.data.recharge.value && (item.data.recharge.charged === false);
      item.isDepleted = item.isOnCooldown && (item.data.uses.per && (item.data.uses.value > 0));
      item.hasTarget = !!item.data.target && !(["none", ""].includes(item.data.target.type));
      if (item.type === "superpower") arr[0].push(item);
      else arr[1].push(item);
      return arr;
    }, [[], []]);

    // Apply item filters
    superpowers = this._filterItems(superpowers, this._filters.arsenal);
    other = this._filterItems(other, this._filters.features);

    // Organize Arsenal
    const arsenal = this._prepareArsenalTab(data, superpowers);

    // Organize Features
    for (let item of other) {
      if (item.type === "weapon") features.weapons.items.push(item);
      else if (item.type === "feature") {
        if (item.data.activation.type) features.actions.items.push(item);
        else features.passive.items.push(item);
      } else features.inventory.items.push(item);
    }

    // Assign and return
    data.features = Object.values(features);
    data.arsenal = arsenal;
  }


  /* -------------------------------------------- */

  /**
   * Add some extra data when rendering the sheet to reduce the amount of logic required within the template.
   */
  getData() {
    const sheetData = super.getData();

    // Challenge Rating
    const cr = parseFloat(sheetData.data.details.cr || 0);
    const crLabels = {0: "0", 0.125: "1/8", 0.25: "1/4", 0.5: "1/2"};
    sheetData.labels["cr"] = cr >= 1 ? String(cr) : crLabels[cr] || 1;
    const source = this.actor.data.data.details.source
    // showing link instead of URL; but disabling it if missing creature type, to allow re-editing
    sheetData['externalUrl'] = source && source.startsWith('http') && this.actor.data.data.details.type

    return sheetData;
  }

  /* -------------------------------------------- */
  /*  Object Updates                              */

  /* -------------------------------------------- */

  /**
   * This method is called upon form submission after form data is validated
   * @param event {Event}       The initial triggering submission event
   * @param formData {Object}   The object of validated form data with which to update the object
   * @private
   */
  _updateObject(event, formData) {

    // Format NPC Challenge Rating
    const crs = {"1/8": 0.125, "1/4": 0.25, "1/2": 0.5};
    let crv = "data.details.cr";
    let cr = formData[crv];
    cr = crs[cr] || parseFloat(cr);
    if (cr) formData[crv] = cr < 1 ? cr : parseInt(cr);

    // Parent ActorSheet update steps
    super._updateObject(event, formData);
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */

  /* -------------------------------------------- */

  /**
   * Activate event listeners using the prepared sheet HTML
   * @param html {HTML}   The prepared HTML object ready to be rendered into the DOM
   */
  activateListeners(html) {
    super.activateListeners(html);

    // Rollable Health Formula
    html.find(".health .rollable").click(this._onRollHealthFormula.bind(this));

    // "Class" and "level"
    html.find(".charlevel").click(this._onUpdateClass.bind(this));
  }

  /* -------------------------------------------- */

  /**
   * Handle rolling NPC health values using the provided formula
   * @param {Event} event     The original click event
   * @private
   */
  _onRollHealthFormula(event) {
    event.preventDefault();
    const formula = this.actor.data.data.attributes.health.formula;
    if (!formula) return;
    const health = new Roll(formula).roll().total;
    AudioHelper.play({src: CONFIG.sounds.dice});
    this.actor.update({"data.attributes.health.value": health, "data.attributes.health.max": health});
  }
}