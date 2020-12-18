import TraitSelector from "../apps/trait-selector.js";
import {KRYX_RPG} from "../config.js";

/**
 * Override and extend the core ItemSheet implementation to handle Kryx RPG specific item types
 * @type {ItemSheet}
 */
export default class ItemSheetKryx extends ItemSheet {

  /** @override */
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      width: 560,
      height: 420,
      classes: ["kryx_rpg", "sheet", "item"],
      resizable: false,
      scrollY: [".tab.details"],
      tabs: [{navSelector: ".tabs", contentSelector: ".sheet-body", initial: "description"}]
    });
  }

  /* -------------------------------------------- */

  /** @override */
  get template() {
    const path = "systems/kryx_rpg/templates/items/";
    return `${path}/${this.item.data.type}.html`;
  }

  /* -------------------------------------------- */

  /** @override */
  getData() {
    const data = super.getData();
    const item = this.item
    data.labels = item.labels;

    // Include CONFIG values
    data.config = CONFIG.KRYX_RPG;

    // Item Type, Status, and Details
    data.itemType = item.type.titleCase();
    data.itemStatus = this._getItemStatus(data.item);
    data.itemProperties = this._getItemProperties(data.item);
    data.isPhysical = item.data.data.hasOwnProperty("quantity");

    // Potential consumption targets
    data.abilityConsumptionTargets = this._getItemConsumptionTargets(data.item);
    if (item.type !== "superpower") {
      data.scalingText = null
    } else {
      const resource = item.mainResource
      const resourceName = item.data.cost === 1 ? resource.nameSingular : resource.name
      data.scalingText = game.i18n.format("KRYX_RPG.ScalingPerResource", {resourceName: resourceName})
    }

    // Action Details
    data.hasAttackRoll = item.hasAttack;
    data.isHealing = item.data.data.actionType === "heal";
    data.isFlatDC = item.data.data.save && item.data.data.save.scaling === "flat_dc";
    return data;
  }

  /* -------------------------------------------- */

  /**
   * Get the valid item consumption targets which exist on the actor
   * @param {Object} item         Item data for the item being displayed
   * @return {{string: string}}   An object of potential consumption targets
   * @private
   */
  _getItemConsumptionTargets(item) {
    const consume = item.data.consume || {};
    if (!consume.type) return [];
    const actor = this.item.actor;
    if (!actor) return {};

    // Ammunition
    if (consume.type === "ammo") {
      return actor.itemTypes.consumable.reduce((ammo, i) => {
        if (i.data.data.consumableType === "ammo") {
          ammo[i.id] = `${i.name} (${i.data.data.quantity})`;
        }
        return ammo;
      }, {});
    }

    // Attributes
    else if (consume.type === "attribute") {
      const attributes = Object.values(CombatTrackerConfig.prototype.getAttributeChoices())[0]; // Bit of a hack
      return attributes.reduce((obj, a) => {
        obj[a] = a;
        return obj;
      }, {});
    }

    // Materials
    else if (consume.type === "material") {
      return actor.items.reduce((obj, i) => {
        if (["consumable", "loot"].includes(i.data.type) && !i.data.data.activation) {
          obj[i.id] = `${i.name} (${i.data.data.quantity})`;
        }
        return obj;
      }, {});
    }

    // Charges
    else if (consume.type === "charges") {
      return actor.items.reduce((obj, i) => {
        const uses = i.data.data.uses || {};
        if (uses.per && uses.max) {
          const label = uses.per === "charges" ? ` (${uses.value} Charges)` : ` (${uses.max} per ${uses.per})`;
          obj[i.id] = i.name + label;
        }
        return obj;
      }, {})
    } else return {};
  }

  /* -------------------------------------------- */

  /**
   * Get the text item status which is shown beneath the Item type in the top-right corner of the sheet
   * @return {string}
   * @private
   */
  _getItemStatus(item) {
    if (item.type === "superpower") {
      return CONFIG.KRYX_RPG.superpowerAvailability[item.data.availability];
    } else if (["weapon", "equipment"].includes(item.type)) {
      return item.data.equipped ? "Equipped" : "Unequipped";
    } else if (item.type === "tool") {
      return item.data.proficient ? "Proficient" : "Not Proficient";
    } else return null
  }

  /* -------------------------------------------- */

  /**
   * Get the Array of item properties which are used in the small sidebar of the description tab
   * @return {Array}
   * @private
   */
  _getItemProperties(item) {
    const props = [];
    const labels = this.item.labels;

    if (item.type === "weapon") {
      props.push(...Object.entries(item.data.properties)
        .filter(e => e[1] === true)
        .map(e => CONFIG.KRYX_RPG.weaponProperties[e[0]]));
    } else if (item.type === "superpower") {
      props.push(
        item.data.cost === 0 ? "Cantrip" : null,
        item.data.themes.value.length ? item.data.themes.value.join(", ") : "No theme",
        item.data.components.concentration ? labels.concentration : null,
        item.data.components.ritual ? "Ritual" : null
      )
    } else if (item.type === "equipment") {
      props.push(CONFIG.KRYX_RPG.equipmentTypes[item.data.armor.type]);
      props.push(labels.armor);
    } else if (item.type === "feature") {
      if (item.data.themes.value.length)
        props.push(item.data.themes.value.join(", "))
    }

    // Action type
    if (item.data.actionType) {
      props.push(CONFIG.KRYX_RPG.itemActionTypes[item.data.actionType]);
    }

    // Action usage
    if ((item.type !== "weapon") && item.data.activation && !isObjectEmpty(item.data.activation)) {
      props.push(
        labels.activation,
        labels.range,
        labels.target,
        labels.duration
      )
    }
    return props.filter(p => !!p);
  }

  /* -------------------------------------------- */

  /** @override */
  setPosition(position = {}) {
    position.height = this._tabs[0].active === "details" ? "auto" : this.options.height;
    return super.setPosition(position);
  }

  /* -------------------------------------------- */
  /*  Form Submission                             */

  /* -------------------------------------------- */

  /** @override */
  _updateObject(event, formData) {

    // Handle Damage Array
    let damage = Object.entries(formData).filter(e => e[0].startsWith("data.damage.parts"));
    formData["data.damage.parts"] = damage.reduce((arr, entry) => {
      if (!entry[1]) return arr // prevents empty damage field from being saved and leading to a bug
      let [i, j] = entry[0].split(".").slice(3);
      if (!arr[i]) arr[i] = [];
      arr[i][j] = entry[1];
      return arr;
    }, []);

    // Handle Effects Array
    let effects = Object.entries(formData).filter(e => e[0].startsWith("data.effects.parts"));
    formData["data.effects.parts"] = effects.reduce((arr, entry) => {
      if (!entry[1]) return arr // prevents empty effects field from being saved and leading to a bug
      let [i, j] = entry[0].split(".").slice(3);
      if (!arr[i]) arr[i] = [];
      arr[i][j] = entry[1];
      return arr;
    }, []);

    // Update the Item
    super._updateObject(event, formData);
  }

  /* -------------------------------------------- */

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);
    html.find(".damage-control").click(this._onDamageControl.bind(this));
    html.find(".additional-effect-control").click(this._onEffectControl.bind(this));

    // Activate any Trait Selectors
    html.find('.summary-themes').click(this._onOpenThemesPicker.bind(this));

    if (this.item.type === "superpower")
      html.find('.item-type').click(this._onClickItemType.bind(this));
    this.limitScalingToPossibilities(html)
  }

  /* -------------------------------------------- */

  limitScalingToPossibilities(html) {
    const allowedOptions = this.item.isManeuver ? ["none", "enhance"] : ["none", "cantrip", "augment"]
    html.find(`select[name="data.scaling.mode"] option`).each((i, option) => {
      if (allowedOptions.includes(option.value)) {
        $(option).show()
      } else {
        $(option).hide()
      }
    })
  }

  /* -------------------------------------------- */

  /**
   * Add or remove a damage part from the damage formula
   * @param {Event} event     The original click event
   * @return {Promise}
   * @private
   */
  async _onDamageControl(event) {
    event.preventDefault();
    const a = event.currentTarget;

    // Add new damage component
    if (a.classList.contains("add-damage-effect")) {
      await this._onSubmit(event);  // Submit any unsaved changes
      const damage = this.item.data.data.damage;
      return this.item.update({"data.damage.parts": damage.parts.concat([["", ""]])});
    }

    // Remove a damage component
    if (a.classList.contains("delete-damage-effect")) {
      await this._onSubmit(event);  // Submit any unsaved changes
      const li = a.closest(".damage-effect-part");
      const damage = duplicate(this.item.data.data.damage);
      damage.parts.splice(Number(li.dataset["damageEffectPart"]), 1);
      return this.item.update({"data.damage.parts": damage.parts});
    }
  }

  /* -------------------------------------------- */

  /**
   * Add or remove an effect to/from the list of additional effects
   *
   * NOTE: the effects list looks like -
   *
   *     effects: {
   *       parts: [
   *         ["burning 1"],
   *         ["prone"]
   *       ]
   *     }
   *
   * This makes it similar in structure to damage.
   *
   * @param {Event} event     The original click event
   * @return {Promise}
   * @private
   */
  async _onEffectControl(event) {
    event.preventDefault();
    const a = event.currentTarget;

    if (a.classList.contains("add-damage-effect")) {
      await this._onSubmit(event);  // Submit any unsaved changes
      const effects = this.item.data.data.effects;
      return this.item.update({"data.effects.parts": effects.parts.concat([[""]])});
    }

    if (a.classList.contains("delete-damage-effect")) {
      await this._onSubmit(event);  // Submit any unsaved changes
      const li = a.closest(".damage-effect-part");
      const effects = duplicate(this.item.data.data.effects);
      effects.parts.splice(Number(li.dataset["damageEffectPart"]), 1);
      return this.item.update({"data.effects.parts": effects.parts});
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle spawning the TraitSelector application which allows a checkbox of multiple trait options
   * @param {Event} event   The click event which originated the selection
   * @private
   */
  _onOpenThemesPicker(event) {
    event.preventDefault();
    let possibleThemes;
    const allThemes = Object.keys(KRYX_RPG.themes)
    const actor = this.item.actor
    if (!actor || actor.getFlag("kryx_rpg", "allowPickingUnknownThemes")) {
      possibleThemes = allThemes
    } else {
      possibleThemes = actor.data.data.traits.themes.value
    }

    // Render the Trait Selector dialog
    new TraitSelector(this.item, {
      name: "data.themes",
      title: game.i18n.localize("KRYX_RPG.ThemesPl"),
      choices: Object.entries(KRYX_RPG.themes).reduce((obj, e) => {
        if (possibleThemes.includes(e[0])) obj[e[0]] = e[1];
        return obj;
      }, {}),
      allowCustom: false,
    }).render(true)
  }

  _onClickItemType(event) {
    event.preventDefault();
    const powerType = this.item.data.data.powerType
    const allPowerTypes = ["spell", "maneuver", "concoction"]
    const newPowerType = allPowerTypes[(allPowerTypes.indexOf(powerType) + 1) % 3]
    this.item.update({"data.powerType": newPowerType})
  }
}
