import ItemKryx from "../../item/entity.js";
import TraitSelector from "../../apps/trait-selector.js";
import ActorSheetFlags from "../../apps/actor-flags.js";
import {KRYX_RPG} from '../../config.js';
import {showUpdateClassDialog} from "../../apps/update-class.js";

/**
 * Extend the basic ActorSheet class to do all the Kryx RPG things!
 * This sheet is an Abstract layer which is not used.
 * @extends {ActorSheet}
 */
export default class ActorSheetKryx extends ActorSheet {
  constructor(...args) {
    super(...args);

    /**
     * Track the set of item filters which are applied
     * @type {Set}
     */
    this._filters = {
      inventory: new Set(),
      arsenal: new Set(),
      features: new Set()
    };
  }

  /* -------------------------------------------- */

  /** @override */
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      scrollY: [
        ".inventory .inventory-list",
        ".features .inventory-list",
        ".arsenal .inventory-list"
      ],
      tabs: [{navSelector: ".tabs", contentSelector: ".sheet-body", initial: "description"}]
    });
  }


  /* -------------------------------------------- */

  /** @override */
  getData() {

    // Basic data
    let isOwner = this.entity.owner;
    const data = {
      owner: isOwner,
      limited: this.entity.limited,
      options: this.options,
      editable: this.isEditable,
      cssClass: isOwner ? "editable" : "locked",
      isCharacter: this.entity.data.type === "character",
      isNPC: this.entity.data.type === "npc",
      showDamageImmunityAndSuch: this.entity.getFlag("kryx_rpg", "kryx_rpg.showDamageImmunityAndSuch"),
      config: CONFIG.KRYX_RPG,
    };

    // Temporary Health
    let health = this.actor.data.data.attributes.health;
    if (parseInt(health.temp) === 0) delete health.temp;
    if (parseInt(health.tempmax) === 0) delete health.tempmax;

    // Always show extra stuff for NPCs
    data.showDamageImmunityAndSuch = data.showDamageImmunityAndSuch || data.isNPC

    // The Actor and its Items
    data.actor = duplicate(this.actor.data);
    data.items = this.actor.items.map(i => {
      i.data.labels = i.labels;
      return i.data;
    });
    data.items.sort((a, b) => (a.sort || 0) - (b.sort || 0));
    data.data = data.actor.data;
    data.labels = this.actor.labels || {};
    data.filters = this._filters;

    // Capitalize mana and stamina
    data.data.mainResources.mana.nameCapitalized = data.data.mainResources.mana.name.capitalize()
    data.data.mainResources.stamina.nameCapitalized = data.data.mainResources.stamina.name.capitalize()

    // Ability Scores
    for (const [a, abl] of Object.entries(data.data.abilities)) {
      abl.label = CONFIG.KRYX_RPG.abilities[a];
    }

    // Saving Throws
    for (const [a, sav] of Object.entries(data.data.saves)) {
      sav.icon = this._getProficiencyIcon(sav.proficiency);
      sav.hover = CONFIG.KRYX_RPG.proficiencyLevels["" + sav.proficiency];
      sav.label = CONFIG.KRYX_RPG.saves[a];
    }

    // Update skill labels
    for (const [s, skl] of Object.entries(data.data.skills)) {
      skl.ability = KRYX_RPG.systemData.skillAbilities[s].capitalize();
      skl.icon = this._getProficiencyIcon(skl.proficiency);
      skl.hover = CONFIG.KRYX_RPG.proficiencyLevels["" + skl.proficiency];
      skl.label = CONFIG.KRYX_RPG.skills[s];
    }

    // Update traits
    this._prepareTraits(data.data.traits);

    // Prepare owned items
    this._prepareItems(data);

    // Return data to the sheet
    return data
  }

  /* -------------------------------------------- */

  _prepareTraits(traits) {
    const map = {
      "themes": CONFIG.KRYX_RPG.themes,
      "dr": CONFIG.KRYX_RPG.damageTypes,
      "di": CONFIG.KRYX_RPG.damageTypes,
      "dv": CONFIG.KRYX_RPG.damageTypes,
      "ci": CONFIG.KRYX_RPG.conditionTypes,
      "languages": CONFIG.KRYX_RPG.languages,
      "armorProf": CONFIG.KRYX_RPG.armorProficiencies,
      "weaponProf": CONFIG.KRYX_RPG.weaponProficiencies,
    };
    for (let [t, choices] of Object.entries(map)) {
      const trait = traits[t];
      if (!trait) continue;
      let values = [];
      if (trait.value) {
        values = trait.value instanceof Array ? trait.value : [trait.value];
      }
      trait.selected = values.reduce((obj, t) => {
        obj[t] = choices[t];
        return obj;
      }, {});

      // Add custom entry
      if (trait.custom) {
        trait.custom.split(";").forEach((c, i) => trait.selected[`custom${i + 1}`] = c.trim());
      }
      trait.cssClass = isObjectEmpty(trait.selected) ? "inactive" : ""
    }
  }

  /* -------------------------------------------- */

  /**
   * Insert arsenal tab (with sections) when rendering the character sheet
   * @param {Object} data     The Actor data being prepared
   * @param {Array} superpowers    The superpowers data being prepared
   * @private
   */
  _prepareArsenalTab(data, superpowers) {
    const isOwner = !!this.actor.owner
    const catalog = {} // this object will hold the sections. in 5e code it's "spellbook"

    // Add and format a catalog entry
    const registerSection = (availability, powerType) => {
      const key = availability + "_" + powerType
      const order = CONFIG.KRYX_RPG.ARSENAL_ORDERING[key]
      const mainResources = data.actor.data.mainResources
      const resource = powerType === "maneuver" ? mainResources.stamina : mainResources.mana
      const superpowerTypeName = resource.nameOfEffect.capitalize()
      const superpowerTypesName = superpowerTypeName + "s" // e.g. "Spells", "Concoctions"
      const superpowerResourceName = resource.nameSingular.capitalize() // e.g. "Mana", "Psi", "Catalyst"
      let label = CONFIG.KRYX_RPG.superpowerAvailability[availability] + " " + superpowerTypesName
      if (availability === "spellbook") {
        // "Spells in Spellbook" instead of "in Spellbook Spells"
        label = game.i18n.localize("KRYX_RPG.SpellsInSpellbook")
      }
      catalog[key] = {
        order: order,
        label: label,
        canCreate: isOwner,
        resourceName: superpowerResourceName,
        superpowers: [],
        dataset: {
          type: "superpower", type_name: superpowerTypeName, availability, "power-type": powerType // HTML limitations
        },
      }
    }

    const mainResources = data.actor.data.mainResources
    if (mainResources.mana.limit > 0) {
      // no one has both spells and concoctions, it's gonna be fine
      const isConcoction = mainResources.mana.nameOfEffect
        === game.i18n.localize("KRYX_RPG.MainResourceManaNamedCatalysts")
      const powerType = isConcoction ? "concoction" : "spell"
      registerSection("atwill", powerType);
      registerSection("known", powerType);
    }

    if (mainResources.stamina.limit > 0) {
      registerSection("known", "maneuver");
    }

    // Iterate over every superpower item, adding superpowers to the book by section, sometimes adding sections
    superpowers.forEach(superpower => {
      const availability = superpower.data.availability
      const powerType = superpower.data.powerType
      const key = availability + "_" + powerType
      if (!catalog[key]) registerSection(availability, powerType)
      catalog[key].superpowers.push(superpower)
    })

    // Sort the catalog
    const sorted = Object.values(catalog);
    sorted.sort((a, b) => a.order - b.order);
    return sorted;
  }

  /* -------------------------------------------- */

  /**
   * Determine whether an Owned Item will be shown based on the current set of filters
   * @return {boolean}
   * @private
   */
  _filterItems(items, filters) {
    return items.filter(item => {
      const data = item.data;

      // Action usage
      for (let f of ["action", "attack", "2 actions", "reaction"]) {
        if (filters.has(f)) {
          if ((data.activation && (data.activation.type !== f))) return false;
        }
      }

      // Spell-specific filters
      if (filters.has("ritual")) {
        if (data.components.ritual !== true) return false;
      }
      if (filters.has("concentration")) {
        if (data.components.concentration !== true) return false;
      }
      if (filters.has("prepared")) {
        if (data.level === 0 || ["innate", "always"].includes(data.preparation.mode)) return true;
        if (this.actor.data.type === "npc") return true;
        return data.preparation.prepared;
      }

      // Equipment-specific filters
      if (filters.has("equipped")) {
        if (data.equipped !== true) return false;
      }
      return true;
    });
  }

  /* -------------------------------------------- */

  /**
   * Get the font-awesome icon used to display a certain level of skill proficiency
   * @private
   */
  _getProficiencyIcon(level) {
    const icons = {
      0: '<i class="far fa-circle"></i>',
      0.5: '<i class="fas fa-adjust"></i>',
      1: '<i class="fas fa-check"></i>',
      1.5: '<i class="fas fa-check-double"></i>', // deprecated
    };
    return icons[level];
  }

  /* -------------------------------------------- */

  /*  Event Listeners and Handlers
  /* -------------------------------------------- */

  /**
   * Activate event listeners using the prepared sheet HTML
   * @param html {HTML}   The prepared HTML object ready to be rendered into the DOM
   */
  activateListeners(html) {

    // Activate Item Filters
    const filterLists = html.find(".filter-list");
    filterLists.each(this._initializeFilterItemList.bind(this));
    filterLists.on("click", ".filter-item", this._onToggleFilter.bind(this));

    // Item summaries
    html.find('.item .item-name h4').click(event => this._onItemSummary(event));

    // Editable Only Listeners
    if (this.isEditable) {

      // Select data on click
      const inputs = html.find("input");
      inputs.focus(ev => ev.currentTarget.select());

      // Relative updates for numeric fields
      inputs.find('input[data-dtype="Number"]').change(this._onChangeInputDelta.bind(this));

      // Save Proficiency
      html.find('.save-proficiency').on("click contextmenu", this._onToggleSaveProficiency.bind(this));

      // Toggle Skill Proficiency
      html.find('.skill-proficiency').on("click contextmenu", this._onCycleSkillProficiency.bind(this));

      // Trait Selector
      html.find('.trait-selector').click(this._onTraitSelector.bind(this));

      // Configure Special Flags
      html.find('.configure-flags').click(this._onConfigureFlags.bind(this));

      // Owned Item management
      html.find('.item-create').click(this._onItemCreate.bind(this));
      html.find('.item-edit').click(this._onItemEdit.bind(this));
      html.find('.item-delete').click(this._onItemDelete.bind(this));
      html.find('.item-uses input').click(ev => ev.target.select()).change(this._onUsesChange.bind(this));
    }

    // Owner Only Listeners
    if (this.actor.owner) {

      // Ability Checks
      html.find('.ability-name').click(this._onRollAbilityTest.bind(this));

      // Saving Throws
      html.find('.save-name').click(this._onRollSavingThrow.bind(this));

      // Roll Skill Checks
      html.find('.skill-name').click(this._onRollSkillCheck.bind(this));

      // Item Rolling
      html.find('.item .item-image').click(event => this._onItemRoll(event));
      html.find('.item .item-recharge').click(event => this._onItemRecharge(event));
    }

    // Otherwise remove rollable classes
    else {
      html.find(".rollable").each((i, el) => el.classList.remove("rollable"));
    }

    // Handle default listeners last so system listeners are triggered first
    super.activateListeners(html);
  }

  /* -------------------------------------------- */

  /**
   * Iinitialize Item list filters by activating the set of filters which are currently applied
   * @private
   */
  _initializeFilterItemList(i, ul) {
    const set = this._filters[ul.dataset.filter];
    const filters = ul.querySelectorAll(".filter-item");
    for (let li of filters) {
      if (set.has(li.dataset.filter)) li.classList.add("active");
    }
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */

  /* -------------------------------------------- */

  /**
   * Handle input changes to numeric form fields, allowing them to accept delta-typed inputs
   * @param event
   * @private
   */
  _onChangeInputDelta(event) {
    const input = event.target;
    const value = input.value;
    if (["+", "-"].includes(value[0])) {
      let delta = parseFloat(value);
      input.value = getProperty(this.actor.data, input.name) + delta;
    } else if (value[0] === "=") {
      input.value = value.slice(1);
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle click events for the Traits tab button to configure special Character Flags
   */
  _onConfigureFlags(event) {
    event.preventDefault();
    new ActorSheetFlags(this.actor).render(true);
  }

  /* -------------------------------------------- */

  /**
   * Handle cycling proficiency in a Skill
   * @param {Event} event   A click or contextmenu event which triggered the handler
   * @private
   */
  _onCycleSkillProficiency(event) {
    event.preventDefault();
    const field = $(event.currentTarget).siblings('input[type="hidden"]');

    // Get the current level and the array of levels
    const level = parseFloat(field.val());
    const levels = this.entity.data.type === "character" ? KRYX_RPG.PROFICIENCY_LEVELS : KRYX_RPG.PROFICIENCY_LEVELS_FOR_NPC
    let idx = levels.indexOf(level);

    // Toggle next level - forward on click, backwards on right
    let newLevel
    if (event.type === "click") {
      newLevel = levels[(idx + 1) % levels.length]
    } else if (event.type === "contextmenu") {
      newLevel = levels[(idx + levels.length - 1) % levels.length]
    } else return
    field.val(newLevel)

    // Update the field value and save the form
    this._onSubmit(event);
  }

  /* -------------------------------------------- */

  /** @override */
  async _onDrop(event) {
    event.preventDefault();

    // Get dropped data
    let data;
    try {
      data = JSON.parse(event.dataTransfer.getData('text/plain'));
    } catch (err) {
      return false;
    }
    if (!data) return false;

    // Case 1 - Dropped Item
    if (data.type === "Item") {
      return this._onDropItem(event, data);
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle dropping of an item reference or item data onto an Actor Sheet
   * @param {DragEvent} event     The concluding DragEvent which contains drop data
   * @param {Object} data         The data transfer extracted from the event
   * @return {Object}             OwnedItem data to create
   * @private
   */
  async _onDropItem(event, data) {
    if (!this.actor.owner) return false;
    let itemData = await this._getItemDropData(event, data);

    // Handle item sorting within the same Actor
    const actor = this.actor;
    let sameActor = (data.actorId === actor._id) || (actor.isToken && (data.tokenId === actor.token.id));
    if (sameActor) return this._onSortItem(event, itemData);

    // Create a spell scroll from a spell item
    if ((itemData.type === "superpower" && itemData.data.powerType === "spell") && (this._tabs[0].active === "inventory")) {
      const scroll = await ItemKryx.createScrollFromSpell(itemData);
      itemData = scroll.data;
    }

    // Create the owned item
    return this.actor.createEmbeddedEntity("OwnedItem", itemData);
  }

  /* -------------------------------------------- */

  /**
   * TODO: A temporary shim method until Item.getDropData() is implemented
   * https://gitlab.com/foundrynet/foundryvtt/-/issues/2866
   * @private
   */
  async _getItemDropData(event, data) {
    let itemData = null;

    // Case 1 - Import from a Compendium pack
    if (data.pack) {
      const pack = game.packs.get(data.pack);
      if (pack.metadata.entity !== "Item") return;
      itemData = await pack.getEntry(data.id);
    }

    // Case 2 - Data explicitly provided
    else if (data.data) {
      itemData = data.data;
    }

    // Case 3 - Import from World entity
    else {
      let item = game.items.get(data.id);
      if (!item) return;
      itemData = item.data;
    }

    // Return a copy of the extracted data
    return duplicate(itemData);
  }

  /* -------------------------------------------- */

  /**
   * Change the uses amount of an Owned Item within the Actor
   * @param {Event} event   The triggering click event
   * @private
   */
  async _onUsesChange(event) {
    event.preventDefault();
    const itemId = event.currentTarget.closest(".item").dataset.itemId;
    const item = this.actor.getOwnedItem(itemId);
    const uses = Math.clamped(0, parseInt(event.target.value), item.data.data.uses.max);
    event.target.value = uses;
    return item.update({'data.uses.value': uses});
  }

  /* -------------------------------------------- */

  /**
   * Handle rolling of an item from the Actor sheet, obtaining the Item instance and dispatching to it's roll method
   * @private
   */
  _onItemRoll(event) {
    event.preventDefault();
    const itemId = event.currentTarget.closest(".item").dataset.itemId;
    const item = this.actor.getOwnedItem(itemId);

    // Roll superpowers through the actor
    if (item.data.type === "superpower") {
      return this.actor.useSuperpower(item, {configureDialog: !event.shiftKey});
    }

    // Otherwise roll the Item directly
    else return item.roll();
  }

  /* -------------------------------------------- */

  /**
   * Handle attempting to recharge an item usage by rolling a recharge check
   * @param {Event} event   The originating click event
   * @private
   */
  _onItemRecharge(event) {
    event.preventDefault();
    const itemId = event.currentTarget.closest(".item").dataset.itemId;
    const item = this.actor.getOwnedItem(itemId);
    item.rollRecharge();
  };

  /* -------------------------------------------- */

  /**
   * Handle rolling of an item from the Actor sheet, obtaining the Item instance and dispatching to it's roll method
   * @private
   */
  _onItemSummary(event) {
    event.preventDefault();
    let li = $(event.currentTarget).parents(".item"),
      item = this.actor.getOwnedItem(li.data("item-id")),
      chatData = item.getChatData({secrets: this.actor.owner});

    // Toggle summary
    if (li.hasClass("expanded")) {
      let summary = li.children(".item-summary");
      summary.slideUp(200, () => summary.remove());
    } else {
      let div = $(`<div class="item-summary">${chatData.description.value}</div>`);
      let props = $(`<div class="item-properties"></div>`);
      chatData.properties.forEach(p => props.append(`<span class="tag">${p}</span>`));
      div.append(props);
      li.append(div.hide());
      div.slideDown(200);
    }
    li.toggleClass("expanded");
  }

  /* -------------------------------------------- */

  /**
   * Handle creating a new Owned Item for the actor using initial data defined in the HTML dataset
   * @param {Event} event   The originating click event
   * @private
   */
  _onItemCreate(event) {
    event.preventDefault();
    const header = event.currentTarget;
    const type = header.dataset.type;
    const typeName = header.dataset.type_name || type.capitalize()
    const itemData = {
      name: game.i18n.format("KRYX_RPG.ItemNew", {typeName}),
      type: type,
      data: duplicate(header.dataset)
    };
    delete itemData.data["type"];
    return this.actor.createOwnedItem(itemData);
  }

  /* -------------------------------------------- */

  /**
   * Handle editing an existing Owned Item for the Actor
   * @param {Event} event   The originating click event
   * @private
   */
  _onItemEdit(event) {
    event.preventDefault();
    const li = event.currentTarget.closest(".item");
    const item = this.actor.getOwnedItem(li.dataset.itemId);
    item.sheet.render(true);
  }

  /* -------------------------------------------- */

  /**
   * Handle deleting an existing Owned Item for the Actor
   * @param {Event} event   The originating click event
   * @private
   */
  _onItemDelete(event) {
    event.preventDefault();
    const li = event.currentTarget.closest(".item");
    this.actor.deleteOwnedItem(li.dataset.itemId);
  }

  /* -------------------------------------------- */

  /**
   * Handle rolling an Ability check, either a test or a saving throw
   * @param {Event} event   The originating click event
   * @private
   */
  _onRollAbilityTest(event) {
    event.preventDefault();
    let ability = event.currentTarget.parentElement.dataset.ability;
    this.actor.rollAbilityTest(ability, {event: event})
  }

  /* -------------------------------------------- */

  /**
   * Handle rolling a saving throw
   * @param {Event} event   The originating click event
   * @private
   */
  _onRollSavingThrow(event) {
    event.preventDefault();
    let save = event.currentTarget.parentElement.dataset.save;
    this.actor.rollSavingThrow(save, {event: event})
  }

  /* -------------------------------------------- */

  /**
   * Handle rolling a Skill check
   * @param {Event} event   The originating click event
   * @private
   */
  _onRollSkillCheck(event) {
    event.preventDefault();
    const skill = event.currentTarget.parentElement.dataset.skill;
    this.actor.rollSkill(skill, {event: event});
  }

  /* -------------------------------------------- */

  /**
   * Handle toggling Ability score proficiency level
   * @param {Event} event     The originating click event
   * @private
   */
  _onToggleSaveProficiency(event) {
    event.preventDefault();
    const field = event.currentTarget.previousElementSibling;
    // + if left-click, - if right-click
    const delta = event.type === "click" ? 0.5 : event.type === "contextmenu" ? -0.5 : 0
    let nextValue = (parseFloat(field.value) + delta + 1.5) % 1.5
    this.actor.update({[field.name]: nextValue});
  }

  /* -------------------------------------------- */

  /**
   * Handle toggling of filters to display a different set of owned items
   * @param {Event} event     The click event which triggered the toggle
   * @private
   */
  _onToggleFilter(event) {
    event.preventDefault();
    const li = event.currentTarget;
    const set = this._filters[li.parentElement.dataset.filter];
    const filter = li.dataset.filter;
    if (set.has(filter)) set.delete(filter);
    else set.add(filter);
    this.render();
  }

  /* -------------------------------------------- */

  /**
   * Handle spawning the TraitSelector application which allows a checkbox of multiple trait options
   * @param {Event} event   The click event which originated the selection
   * @private
   */
  _onTraitSelector(event) {
    event.preventDefault();
    const a = event.currentTarget;
    const label = a.parentElement.querySelector("label");
    const options = {
      name: a.dataset.target,
      title: label.innerText,
      choices: CONFIG.KRYX_RPG[a.dataset.options],
      allowCustom: !a.dataset.hasOwnProperty("disallow-custom"),
    };
    new TraitSelector(this.actor, options).render(true)
  }

  /* -------------------------------------------- */

  /**
   * @param {MouseEvent} event    The originating click event
   * @private
   */
  async _onUpdateClass(event) {
    event.preventDefault();
    return showUpdateClassDialog(this.actor)
  }
}
