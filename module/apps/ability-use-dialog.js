/**
 * A specialized Dialog subclass for ability usage
 * @type {Dialog}
 */
export default class AbilityUseDialog extends Dialog {
  constructor(item, dialogData = {}, options = {}) {
    super(dialogData, options);
    this.options.classes = ["kryx_rpg", "dialog"];

    /**
     * Store a reference to the Item entity being used
     * @type {ItemKryx}
     */
    this.item = item;
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /**
   * A constructor function which displays the Ability Use Dialog app for a given Actor and Item.
   * Returns a Promise which resolves to the dialog FormData once the workflow has been completed.
   * @param {ItemKryx} item
   * @return {Promise}
   */
  static async create(item) {

    const itemData = item.data.data;
    const uses = itemData.uses || {};
    const quantity = itemData.quantity || 0;
    const recharge = itemData.recharge || {};
    const recharges = !!recharge.value;
    // special cases:
    // "superpower", "feature", "weapon", "equipment", "consumable", "tool", "loot", "backpack"
    let itemWithName
    if (item.type === "superpower") itemWithName = `${item.data.name} ${item.powerType}`
    else if (item.type === "feature") itemWithName = `${item.data.name} ${item.featureType}`
    else itemWithName = item.name
    const abilityUseHint = game.i18n.format("KRYX_RPG.AbilityUseHint", {itemWithName})

    // Render the ability usage template
    const html = await renderTemplate("systems/kryx_rpg/templates/apps/ability-use.html", {
      item: item.data,
      title: abilityUseHint,
      note: this._getAbilityUseNote(item.data, uses, recharge),
      canUse: recharges ? recharge.charged : (quantity > 0 && !uses.value) || uses.value > 0,
      hasPlaceableTemplate: game.user.can("TEMPLATE_CREATE") && item.hasPlaceableTemplate,
    });

    // Create the Dialog and return as a Promise
    return new Promise((resolve) => {
      let formData = null;
      const dlg = new this(item, {
        title: `${item.name}: Usage Configuration`,
        content: html,
        buttons: {
          use: {
            icon: '<i class="fas fa-fist-raised"></i>',
            label: "Use",
            callback: html => formData = new FormData(html[0].querySelector("#ability-use-form"))
          }
        },
        default: "use",
        close: () => resolve(formData)
      });
      dlg.render(true);
    });
  }

  /* -------------------------------------------- */

  static _getAbilityUseNote(item, uses, recharge) {
    let itemType
    if (item.type === "superpower") itemType = item.powerType
    else if (item.type === "feature") itemType = item.featureType
    else itemType = item.type

    // Zero quantity
    const quantity = item.data.quantity;
    if (quantity <= 0) return game.i18n.localize("KRYX_RPG.AbilityUseUnavailableHint", {
      type: itemType,
      per: CONFIG.KRYX_RPG.limitedUsePeriods[uses.per],
    });

    // Abilities which use Recharge
    if (!!recharge.value) {
      return game.i18n.format(recharge.charged ? "KRYX_RPG.AbilityUseChargedHint" : "KRYX_RPG.AbilityUseRechargeHint", {
        type: itemType,
      })
    }

    // Does not use any resource
    if (!uses.per || !uses.max) return "";

    // Consumables
    if (item.type === "consumable") {
      let str = "KRYX_RPG.AbilityUseNormalHint";
      if (uses.value > 1) str = "KRYX_RPG.AbilityUseConsumableChargeHint";
      else if (item.data.quantity === 1 && uses.autoDestroy) str = "KRYX_RPG.AbilityUseConsumableDestroyHint";
      else if (item.data.quantity > 1) str = "KRYX_RPG.AbilityUseConsumableQuantityHint";
      return game.i18n.format(str, {
        type: item.data.consumableType,
        value: uses.value,
        quantity: item.data.quantity,
        max: uses.max,
        per: CONFIG.KRYX_RPG.limitedUsePeriods[uses.per]
      });
    }

    // Other Items
    else {
      return game.i18n.format("KRYX_RPG.AbilityUseNormalHint", {
        type: itemType,
        value: uses.value,
        max: uses.max,
        per: CONFIG.KRYX_RPG.limitedUsePeriods[uses.per]
      });
    }
  }
}
