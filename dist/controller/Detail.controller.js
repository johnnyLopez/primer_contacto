/*global location */
sap.ui.define([
	"com/corona/controller/BaseController",
	"sap/ui/model/json/JSONModel",
	"com/corona/model/formatter",
	"sap/m/MessageBox",
	"sap/m/MessageToast",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	'sap/m/Button',
	'sap/m/Dialog',
	'sap/m/Text'
], function(BaseController, JSONModel, formatter, MessageBox, MessageToast, Filter, FilterOperator, Button, Dialog, Text) {
	"use strict";
	return BaseController.extend("com.corona.controller.Detail", {
		formatter: formatter,
		_timeout: '',
		/* =========================================================== */
		/* lifecycle methods                                           */
		/* =========================================================== */
		onInit: function() {
			// Model used to manipulate control states. The chosen values make sure,
			// detail page is busy indication immediately so there is no break in
			// between the busy indication for loading the view's meta data
			var oViewModel = new JSONModel({
				busy: false,
				delay: 0,
				lineItemListTitle: this.getResourceBundle().getText("detailLineItemTableHeading")
			});
			this.getRouter().getRoute("object").attachPatternMatched(this._onObjectMatched, this);
			this.setModel(oViewModel, "detailView");
			this.getOwnerComponent().getModel().metadataLoaded().then(this._onMetadataLoaded.bind(this));
			this._oODataModel = this.getOwnerComponent().getModel();
			this._oResourceBundle = this.getResourceBundle();
		},
		/* =========================================================== */
		/* event handlers                                              */
		/* =========================================================== */
		/**
		 * Event handler when the share by E-Mail button has been clicked
		 * @public
		 */
		onShareEmailPress: function() {
			var oViewModel = this.getModel("detailView");
			sap.m.URLHelper.triggerEmail(null, oViewModel.getProperty("/shareSendEmailSubject"), oViewModel.getProperty(
				"/shareSendEmailMessage"));
		},
		/**
		 * Event handler when the share in JAM button has been clicked
		 * @public
		 */
		onShareInJamPress: function() {
			var oViewModel = this.getModel("detailView"),
				oShareDialog = sap.ui.getCore().createComponent({
					name: "sap.collaboration.components.fiori.sharing.dialog",
					settings: {
						object: {
							id: location.href,
							share: oViewModel.getProperty("/shareOnJamTitle")
						}
					}
				});
			oShareDialog.open();
		},
		/**
		 * Updates the item count within the line item table's header
		 * @param {object} oEvent an event containing the total number of items in the list
		 * @private
		 */
		onListUpdateFinished: function(oEvent) {
			var sTitle, iTotalItems = oEvent.getParameter("total"),
				oViewModel = this.getModel("detailView");
			// only update the counter if the length is final
			if (this.byId("lineItemsList").getBinding("items").isLengthFinal()) {
				if (iTotalItems) {
					sTitle = this.getResourceBundle().getText("detailLineItemTableHeadingCount", [iTotalItems]);
				} else {
					//Display 'Line Items' instead of 'Line items (0)'
					sTitle = this.getResourceBundle().getText("detailLineItemTableHeading");
				}
				oViewModel.setProperty("/lineItemListTitle", sTitle);
			}
		},
		/**
		 * Event handler (attached declaratively) for the view delete button. Deletes the selected item. 
		 * @function
		 * @public
		 */
		onDelete: function() {
			var that = this;
			var oViewModel = this.getModel("detailView"),
				sPath = oViewModel.getProperty("/sObjectPath"),
				sObjectHeader = this._oODataModel.getProperty(sPath + "/Qmtxt"),
				sQuestion = this._oResourceBundle.getText("deleteText", sObjectHeader),
				sSuccessMessage = this._oResourceBundle.getText("deleteSuccess", sObjectHeader);
			var fnMyAfterDeleted = function() {
				MessageToast.show(sSuccessMessage);
				oViewModel.setProperty("/busy", false);
				var oNextItemToSelect = that.getOwnerComponent().oListSelector.findNextItem(sPath);
				that.getModel("appView").setProperty("/itemToSelect", oNextItemToSelect.getBindingContext().getPath()); //save last deleted
			};
			this._confirmDeletionByUser({
				question: sQuestion
			}, [sPath], fnMyAfterDeleted);
		},
		/**
		 * Event handler (attached declaratively) for the view edit button. Open a view to enable the user update the selected item. 
		 * @function
		 * @public
		 */
		onEdit: function() {
			this.getModel("appView").setProperty("/addEnabled", false);
			var sObjectPath = this.getView().getElementBinding().getPath();
			this.getRouter().getTargets().display("create", {
				mode: "update",
				objectPath: sObjectPath
			});
		},
		/* =========================================================== */
		/* begin: internal methods                                     */
		/* =========================================================== */
		/**
		 * Binds the view to the object path and expands the aggregated line items.
		 * @function
		 * @param {sap.ui.base.Event} oEvent pattern match event in route 'object'
		 * @private
		 */
		_onObjectMatched: function(oEvent) {
			var oParameter = oEvent.getParameter("arguments");
			for (var value in oParameter) {
				oParameter[value] = decodeURIComponent(oParameter[value]);
			}
			this.getModel().metadataLoaded().then(function() {
				var sObjectPath = this.getModel().createKey("AvisoSet", oParameter);
				this._bindView("/" + sObjectPath);
			}.bind(this));
		},
		/**
		 * Binds the view to the object path. Makes sure that detail view displays
		 * a busy indicator while data for the corresponding element binding is loaded.
		 * @function
		 * @param {string} sObjectPath path to the object to be bound to the view.
		 * @private
		 */
		_bindView: function(sObjectPath) {
			// Set busy indicator during view binding
			var oViewModel = this.getModel("detailView");
			// If the view was not bound yet its not busy, only if the binding requests data it is set to busy again
			oViewModel.setProperty("/busy", false);
			this.getView().bindElement({
				path: sObjectPath,
				events: {
					change: this._onBindingChange.bind(this),
					dataRequested: function() {
						oViewModel.setProperty("/busy", true);
					},
					dataReceived: function() {
						oViewModel.setProperty("/busy", false);
					}
				}
			});

			//Asignar los valores del Aviso al Combo
			this.f_select_key_combos();
		},

		//onNavBack: function() {
		//	this.f_retornar_launchpad();
		//},

		/**
		 * Event handler for binding change event
		 * @function
		 * @private
		 */
		_onBindingChange: function() {
			var oView = this.getView(),
				oElementBinding = oView.getElementBinding(),
				oViewModel = this.getModel("detailView"),
				oAppViewModel = this.getModel("appView");
			// No data for the binding
			if (!oElementBinding.getBoundContext()) {
				this.getRouter().getTargets().display("detailObjectNotFound");
				// if object could not be found, the selection in the master list
				// does not make sense anymore.
				this.getOwnerComponent().oListSelector.clearMasterListSelection();
				return;
			}
			var sPath = oElementBinding.getBoundContext().getPath(),
				oResourceBundle = this.getResourceBundle(),
				oObject = oView.getModel().getObject(sPath),
				sObjectId = oObject.Qmnum,
				sObjectName = oObject.Qmtxt;
			oViewModel.setProperty("/sObjectId", sObjectId);
			oViewModel.setProperty("/sObjectPath", sPath);
			oAppViewModel.setProperty("/itemToSelect", sPath);
			this.getOwnerComponent().oListSelector.selectAListItem(sPath);
			oViewModel.setProperty("/saveAsTileTitle", oResourceBundle.getText("shareSaveTileAppTitle", [sObjectName]));
			oViewModel.setProperty("/shareOnJamTitle", sObjectName);
			oViewModel.setProperty("/shareSendEmailSubject", oResourceBundle.getText("shareSendEmailObjectSubject", [sObjectId]));
			oViewModel.setProperty("/shareSendEmailMessage", oResourceBundle.getText("shareSendEmailObjectMessage", [
				sObjectName,
				sObjectId,
				location.href
			]));
		},
		/**
		 * Event handler for metadata loaded event
		 * @function
		 * @private
		 */
		_onMetadataLoaded: function() {
			// Store original busy indicator delay for the detail view
			var iOriginalViewBusyDelay = this.getView().getBusyIndicatorDelay(),
				oViewModel = this.getModel("detailView"),
				oLineItemTable = this.byId("lineItemsList"),
				iOriginalLineItemTableBusyDelay = oLineItemTable.getBusyIndicatorDelay();
			// Make sure busy indicator is displayed immediately when
			// detail view is displayed for the first time
			oViewModel.setProperty("/delay", 0);
			oViewModel.setProperty("/lineItemTableDelay", 0);
			oLineItemTable.attachEventOnce("updateFinished", function() {
				// Restore original busy indicator delay for line item table
				oViewModel.setProperty("/lineItemTableDelay", iOriginalLineItemTableBusyDelay);
			});
			// Binding the view will set it to not busy - so the view is always busy if it is not bound
			oViewModel.setProperty("/busy", true);
			// Restore original busy indicator delay for the detail view
			oViewModel.setProperty("/delay", iOriginalViewBusyDelay);
		},
		/**
		 * Opens a dialog letting the user either confirm or cancel the deletion of a list of entities
		 * @param {object} oConfirmation - Possesses up to two attributes: question (obligatory) is a string providing the statement presented to the user.
		 * title (optional) may be a string defining the title of the popup.
		 * @param {object} oConfirmation - Possesses up to two attributes: question (obligatory) is a string providing the statement presented to the user.
		 * @param {array} aPaths -  Array of strings representing the context paths to the entities to be deleted. Currently only one is supported.
		 * @param {callback} fnAfterDeleted (optional) - called after deletion is done. 
		 * @param {callback} fnDeleteCanceled (optional) - called when the user decides not to perform the deletion
		 * @param {callback} fnDeleteConfirmed (optional) - called when the user decides to perform the deletion. A Promise will be passed
		 * @function
		 * @private
		 */
		/* eslint-disable */
		// using more then 4 parameters for a function is justified here
		_confirmDeletionByUser: function(oConfirmation, aPaths, fnAfterDeleted, fnDeleteCanceled, fnDeleteConfirmed) {
			/* eslint-enable */
			// Callback function for when the user decides to perform the deletion
			var fnDelete = function() {
				// Calls the oData Delete service
				this._callDelete(aPaths, fnAfterDeleted);
			}.bind(this);
			// Opens the confirmation dialog
			MessageBox.show(oConfirmation.question, {
				icon: oConfirmation.icon || MessageBox.Icon.WARNING,
				title: oConfirmation.title || this._oResourceBundle.getText("delete"),
				actions: [
					MessageBox.Action.OK,
					MessageBox.Action.CANCEL
				],
				onClose: function(oAction) {
					if (oAction === MessageBox.Action.OK) {
						fnDelete();
					} else if (fnDeleteCanceled) {
						fnDeleteCanceled();
					}
				}
			});
		},
		/**
		 * Performs the deletion of a list of entities.
		 * @param {array} aPaths -  Array of strings representing the context paths to the entities to be deleted. Currently only one is supported.
		 * @param {callback} fnAfterDeleted (optional) - called after deletion is done. 
		 * @return a Promise that will be resolved as soon as the deletion process ended successfully.
		 * @function
		 * @private
		 */
		_callDelete: function(aPaths, fnAfterDeleted) {
			var oViewModel = this.getModel("detailView");
			oViewModel.setProperty("/busy", true);
			var fnFailed = function() {
				this._oODataModel.setUseBatch(true);
			}.bind(this);
			var fnSuccess = function() {
				if (fnAfterDeleted) {
					fnAfterDeleted();
					this._oODataModel.setUseBatch(true);
				}
				oViewModel.setProperty("/busy", false);
			}.bind(this);
			return this._deleteOneEntity(aPaths[0], fnSuccess, fnFailed);
		},
		/**
		 * Deletes the entity from the odata model
		 * @param {array} aPaths -  Array of strings representing the context paths to the entities to be deleted. Currently only one is supported.
		 * @param {callback} fnSuccess - Event handler for success operation.
		 * @param {callback} fnFailed - Event handler for failure operation.
		 * @function
		 * @private
		 */
		_deleteOneEntity: function(sPath, fnSuccess, fnFailed) {
			var oPromise = new Promise(function(fnResolve, fnReject) {
				this._oODataModel.setUseBatch(false);
				this._oODataModel.remove(sPath, {
					success: fnResolve,
					error: fnReject,
					async: true
				});
			}.bind(this));
			oPromise.then(fnSuccess, fnFailed);
			return oPromise;
		},

		//ADD_JHONY
		/**
		 * Asignar las Claves a los Combox
		 * @function
		 * @public
		 */
		f_select_key_combos: function() {
			//Se obtiene el contexto para los datos del Aviso Seleccionado
			var bindingContex = this.getView().getBindingContext();

			//Combo Prioridad
			var prioridad = bindingContex.getProperty("Priori");
			this.getView().byId("cmb_prioridad").setSelectedKey(prioridad);

			//Combo Tipo Usuario
			var tipoUsr = bindingContex.getProperty("Qmcod");
			this.getView().byId("cmb_tip_usr").setSelectedKey(tipoUsr);

			this.getView().byId("check_primer_contac").setSelected(false);

			this.getView().byId("check_primer_contac").setEnabled(true);
			this.getView().byId("cmb_tip_usr").setEnabled(true);

			if (bindingContex.getProperty("Primcr") === 'X') {
				this.getView().byId("check_primer_contac").setSelected(true);
				this.getView().byId("check_primer_contac").setEnabled(false);
				this.getView().byId("cmb_tip_usr").setEnabled(false);
			}

		},

		handleValueHelp: function(oController) {
			//this.inputId = oController.oSource.sId;
			// create value help dialog
			if (!this._valueHelpDialog) {
				this._valueHelpDialog = sap.ui.xmlfragment("com.corona.view.fragment.DlgStatus", this);
				this.getView().addDependent(this._valueHelpDialog);
			}
			// open value help dialog
			this._valueHelpDialog.open();
		},
		_handleValueHelpSearch: function(evt) {
			var sValue = evt.getParameter("value");
			var oFilter = new Filter("Txt04", sap.ui.model.FilterOperator.Contains, sValue);
			evt.getSource().getBinding("items").sOperationMode = "Client";
			evt.getSource().getBinding("items").filter([oFilter]);
		},

		_handleValueHelpClose: function(evt) {
			var oSelectedItem = evt.getParameter("selectedItem");
			//Se obtiene el contexto para los datos del Aviso Seleccionado
			var bindingContext = this.getView().getBindingContext();
			var pathAviso = bindingContext.getPath();

			if (oSelectedItem) {
				var estatus_usr = this.getView().byId("txt_status_usr");
				estatus_usr.setValue(oSelectedItem.getDescription());

				this.getView().getModel().setProperty(pathAviso + '/Statusr', oSelectedItem.getTitle());
			}
			evt.getSource().getBinding("items").filter([]);
		},
		/**
		 * Abrir el Dialogo con la Lista de Sintomas
		 * @function
		 * @public
		 */
		f_ayuda_busqueda_sint: function(oController) {
			//this.inputId = oController.oSource.sId;
			// create value help dialog
			if (!this._dialogo_sintoma) {
				this._dialogo_sintoma = sap.ui.xmlfragment("com.corona.view.fragment.DlgSintoma", this);
				this.getView().addDependent(this._dialogo_sintoma);
			}
			// open value help dialog
			this._dialogo_sintoma.open();
		},
		/**
		 * Abrir el Dialogo con la Lista de partes
		 * @function
		 * @public
		 */
		f_ayuda_busqueda_parte: function() {
			if (!this._dialogo_parte) {
				this._dialogo_parte = sap.ui.xmlfragment("com.corona.view.fragment.DlgParte", this);
				this.getView().addDependent(this._dialogo_parte);
			}
			// open value help dialog
			this._dialogo_parte.open();
		},
		/**
		 * Filtrar la lista de sintomas de la Ayuda de búsqueda
		 * @function
		 * @param {Object} evt Evento ejecutado cuando el cliente oprime icono Buscar
		 * @public
		 */
		f_search_grupocod: function(evt) {
			var sValue = evt.getParameter("value");
			var oFilter = new Filter("Grupoc", FilterOperator.Contains, sValue);
			var oFilter2 = new Filter("Code", FilterOperator.Contains, sValue);
			var oFilter3 = new Filter("Descod", FilterOperator.Contains, sValue);
			var filtros = new Filter([
				oFilter,
				oFilter2,
				oFilter3
			], false);

			var sOperationMode = evt.getSource().getBinding("items").sOperationMode;
			evt.getSource().getBinding("items").sOperationMode = "Client";
			evt.getSource().getBinding("items").filter(filtros);

			evt.getSource().getBinding("items").sOperationMode = sOperationMode;
		},
		/**
		 * Abrir el Dialogo con la Lista de partes
		 * @function
		 * @public
		 */
		f_ayuda_busqueda_material: function(event) {
			if (!this._dialogo_material) {
				this._dialogo_material = sap.ui.xmlfragment("com.corona.view.fragment.DlgMaterial", this);
				this.getView().addDependent(this._dialogo_material);
			}
			// open value help dialog
			this._dialogo_material.open();
		},

		/**
		 * Implementar la búsqueda de Materiales
		 * @function
		 * @param {Object} evt Evento ejecutado cuando el cliente oprime icono Buscar
		 * @public
		 */
		f_Search_material: function(evt) {
			var sValue = evt.getParameter("value");
			//Add Jhony Giraldo

			var BindingContext = this.getView().getBindingContext();
			var werks = BindingContext.getProperty("Werks");

			var filters = [];
			var sFilter;
			sFilter = new sap.ui.model.Filter("Werks", sap.ui.model.FilterOperator.EQ, werks);
			filters.push(sFilter);
			sFilter = new sap.ui.model.Filter("Matnr", sap.ui.model.FilterOperator.EQ, "*" + sValue + "*");
			filters.push(sFilter);
			sFilter = new sap.ui.model.Filter("Maktx", sap.ui.model.FilterOperator.EQ, "*" + sValue + "*");
			filters.push(sFilter);
			var binding = evt.getSource().getBinding("items");
			binding.filter(filters);
		},

		f_confirm_material: function(evt) {
			var oSelectedItem = evt.getParameter("selectedItem");
			if (oSelectedItem) {
				var material = sap.ui.getCore().getElementById("cod_material_select");
				material.setValue(oSelectedItem.getTitle());
				var descri_material = sap.ui.getCore().getElementById("desc_material_select");
				descri_material.setText(oSelectedItem.getDescription());
			}
			evt.getSource().getBinding("items").filter([]);
		},

		f_confirm_parte: function(evt) {
			var oSelectedItem = evt.getParameter("selectedItem");
			if (oSelectedItem) {
				var cod_parte = sap.ui.getCore().getElementById("cod_parte_select");
				cod_parte.setValue(oSelectedItem.getDescription());

				var info_parte = oSelectedItem.getTitle().split("||");

				sap.ui.getCore().getElementById("grup_cod_parte").setText(info_parte[0]);
				sap.ui.getCore().getElementById("cod_parte").setText(info_parte[1]);
			}
			evt.getSource().getBinding("items").filter([]);
		},

		f_confirm_sintoma: function(evt) {
			var oSelectedItem = evt.getParameter("selectedItem");
			if (oSelectedItem) {
				var cod_parte = sap.ui.getCore().getElementById("cod_sintoma_select");
				cod_parte.setValue(oSelectedItem.getDescription());

				var info_parte = oSelectedItem.getTitle().split("||");

				sap.ui.getCore().getElementById("grup_cod_sintoma").setText(info_parte[0]);
				sap.ui.getCore().getElementById("cod_sintoma").setText(info_parte[1]);
			}
			evt.getSource().getBinding("items").filter([]);
		},

		/**
		 * Abrir el Dialogo para tartar un Conjunto
		 * @function
		 * @public
		 */
		f_dialogo_conjunto: function(event) {
			this.f_visualiza_dlg_conjunto("com.corona.view.fragment.SelectConjunto");

			var getPath = event.getSource()._oSelectedItem.getBindingContext().getPath();
			var BindingContext = event.getSource()._oSelectedItem.getBindingContext();
			//Se mapea Código de Material
			var material = sap.ui.getCore().getElementById("cod_material_select");
			material.setValue(BindingContext.getProperty("Bautl"));
			//Se mapea Descripción de Material.
			var dec_material = sap.ui.getCore().getElementById("desc_material_select");
			dec_material.setText(BindingContext.getProperty("Bautx"));

			//Se mapea Sintoma.
			var cod_sintoma = sap.ui.getCore().getElementById("cod_sintoma_select");
			cod_sintoma.setValue(BindingContext.getProperty("Txtcdfe"));
			sap.ui.getCore().getElementById("grup_cod_sintoma").setText(BindingContext.getProperty("Fegrp"));
			sap.ui.getCore().getElementById("cod_sintoma").setText(BindingContext.getProperty("Fecod"));

			//Se mapea Parte. 
			var cod_parte = sap.ui.getCore().getElementById("cod_parte_select");
			cod_parte.setValue(BindingContext.getProperty("Txtcdot"));

			sap.ui.getCore().getElementById("grup_cod_parte").setText(BindingContext.getProperty("Otgrp"));
			sap.ui.getCore().getElementById("cod_parte").setText(BindingContext.getProperty("Oteil"));

			//Se mapea Cantidad
			var cantidad = sap.ui.getCore().getElementById("cantidad_select");
			cantidad.setValue(BindingContext.getProperty("Canti"));

			this.Path_conjunto = getPath;

			this._dialogo_conjunto.open();
		},

		f_visualiza_dlg_conjunto: function(p_Dialogo) {
			if (!this._dialogo_conjunto) {
				this._dialogo_conjunto = sap.ui.xmlfragment(p_Dialogo, this);
				this.getView().addDependent(this._dialogo_conjunto);
			}
		},

		f_dlg_crear_conjunto: function() {
			this.f_visualiza_dlg_conjunto("com.corona.view.fragment.CrearConjunto");

			sap.ui.getCore().getElementById("cod_material_select").setValue("");
			sap.ui.getCore().getElementById("desc_material_select").setText("");

			//Se limpia Cantidad
			sap.ui.getCore().getElementById("cantidad_select").setValue("");

			//Parte
			sap.ui.getCore().getElementById("grup_cod_parte").setText("");
			sap.ui.getCore().getElementById("cod_parte").setText("");
			sap.ui.getCore().getElementById("cod_parte_select").setValue("");

			//Sintoma
			sap.ui.getCore().getElementById("grup_cod_sintoma").setText("");
			sap.ui.getCore().getElementById("cod_sintoma").setText("");
			sap.ui.getCore().getElementById("cod_sintoma_select").setValue("");

			this._dialogo_conjunto.open();
		},
		/**
		 * Cerrar y destruir Dialogo Conjunto
		 * @function
		 * @public
		 */
		f_close_dialogo_conjunto: function() {
			this._dialogo_conjunto.close();
			this._dialogo_conjunto.destroy(true);
			this._dialogo_conjunto = undefined;

			//Se quita la fila que se tenia seleccionada.
			var list_conju = this.getView().byId("lineItemsList");
			list_conju.removeSelections(true);
			//var fila_seleccionada = list_conju._oItemNavigation.iFocusedIndex;
			//list_conju.getItems()[fila_seleccionada - 1].setSelected(false);
		},

		/**
		 * Actualizar Datos de Conjunto según lo digitado por el usuario.
		 * @function
		 * @public
		 */
		f_actualiza_conjunto: function() {
			var oModel_conjunto = this.getView().byId("lineItemsList").getModel();
			//Se mapea Código de Material
			var material = sap.ui.getCore().getElementById("cod_material_select");
			oModel_conjunto.setProperty(this.Path_conjunto + "/Bautl", material.getValue());
			var descri_material = sap.ui.getCore().getElementById("desc_material_select");
			oModel_conjunto.setProperty(this.Path_conjunto + "/Bautx", descri_material.getText());

			var cod_sintoma = sap.ui.getCore().getElementById("cod_sintoma_select").getValue();

			oModel_conjunto.setProperty(this.Path_conjunto + "/Txtcdfe", cod_sintoma);

			//Grupo de Códigos Sintoma
			oModel_conjunto.setProperty(this.Path_conjunto + "/Fegrp", sap.ui.getCore().getElementById("grup_cod_sintoma").getText());

			//Código Sintoma
			oModel_conjunto.setProperty(this.Path_conjunto + "/Fecod", sap.ui.getCore().getElementById("cod_sintoma").getText());

			//Se mapea Parte.
			var cod_parte = sap.ui.getCore().getElementById("cod_parte_select").getValue();

			oModel_conjunto.setProperty(this.Path_conjunto + "/Txtcdot", cod_parte);
			oModel_conjunto.setProperty(this.Path_conjunto + "/Otgrp", sap.ui.getCore().getElementById("grup_cod_parte").getText());
			oModel_conjunto.setProperty(this.Path_conjunto + "/Oteil", sap.ui.getCore().getElementById("cod_parte").getText());

			//Se mapea Cantidad
			var cantidad = sap.ui.getCore().getElementById("cantidad_select");
			oModel_conjunto.setProperty(this.Path_conjunto + "/Canti", cantidad.getValue());

			//Marcar como Modificado.
			oModel_conjunto.setProperty(this.Path_conjunto + "/Opera", 'U');

			this.f_close_dialogo_conjunto();
		},

		/**
		 * Enviar datos de modificación al ERP
		 * @function
		 * @public
		 */
		f_modificar_dat_aviso: function() {

			//Ruta del aviso seleccionado
			var BindingContext = this.getView().getBindingContext();

			var oModel = new sap.ui.model.odata.ODataModel(BindingContext.oModel.sServiceUrl, true);

			var pathAviso = BindingContext.getPath();

			var oEntry = {};

			oEntry.Bita = BindingContext.getProperty("Bita"); //Ojo Modificar

			oEntry.Name1 = BindingContext.getProperty("Name1");
			if ((oEntry.Name1 === null) || (oEntry.Name1 === "")) {
				this.f_MessageErrorDialog("El campo Nombre es Obligatorio");
				return;
			}

			oEntry.Name2 = BindingContext.getProperty("Name2");
			
			if(oEntry.Name2 === null){
				oEntry.Name2="";
			}
			
			oEntry.Celu = BindingContext.getProperty("Celu"); // Ojo falta
			if ((oEntry.Celu === null) || (oEntry.Celu === "")) {
				this.f_MessageErrorDialog("El campo Celular es Obligatorio");
				return;
			}

			oEntry.Tele = BindingContext.getProperty("Tele");
			if ((oEntry.Tele === null) || (oEntry.Tele === "")) {
				this.f_MessageErrorDialog("El campo Teléfono es Obligatorio");
				return;
			}

			oEntry.City1 = BindingContext.getProperty("City1");
			oEntry.Street2 = BindingContext.getProperty("Street2");
			if ((oEntry.Street2 === null) || (oEntry.Street2 === "")) {
				this.f_MessageErrorDialog("El campo Calle 3 es Obligatorio");
				return;
			}

			oEntry.Street = BindingContext.getProperty("Street");
			if ((oEntry.Street === null) || (oEntry.Street === "")) {
				this.f_MessageErrorDialog("El campo Calle es Obligatorio");
				return;
			}

			oEntry.Statusr = BindingContext.getProperty("Statusr");
			oEntry.Adrnr = BindingContext.getProperty("Adrnr");

			//Tipo de Usuario
			oEntry.Qmcod = this.getView().byId("cmb_tip_usr").getSelectedKey();

			//Grupo de Códigos Tipo de Usuario
			oEntry.Qmgrp = BindingContext.getProperty("Qmgrp");

			//Prioridad
			oEntry.Priori = this.getView().byId("cmb_prioridad").getSelectedKey();

			oEntry.Arbpl = BindingContext.getProperty("Arbpl");

			oEntry.Werks = BindingContext.getProperty("Werks");
			oEntry.Qmnum = BindingContext.getProperty("Qmnum");
			oEntry.Qmart = BindingContext.getProperty("Qmart");

			oEntry.Artpr = BindingContext.getProperty("Artpr");
			oEntry.Qmdat = BindingContext.getProperty("Qmdat");
			oEntry.Mzeit = BindingContext.getProperty("Mzeit");

			oEntry.Qmtxt = BindingContext.getProperty("Qmtxt");
			oEntry.Rbnr = BindingContext.getProperty("Rbnr");

			if (BindingContext.getProperty("Primcr") !== 'X') {
				if (this.getView().byId("check_primer_contac").getSelected()) {
					oEntry.Primc = 'X';
				}
			}
			
			oEntry.Bita_c = BindingContext.getProperty("Bita_c");

			//Abrir el mensaje para indicar que los datos se vanb a cargar
			this.f_dialogo_progreso("com.corona.view.fragment.DlgGuardaAviso");

			this._timeout = jQuery.sap.delayedCall(2000, this, function() {

				var obj_this = this;

				var fnSucess = function(data, response) {
					var mensaje;

					obj_this.f_modificar_conjunto(function() {
						obj_this.f_MessageSuccesDialog("Los datos se Guardaron Exitosamente");
						obj_this.f_close_dialogo_progreso();
					});
					//obj_this.f_MessageSuccesDialog("Los datos se Guardaron Exitosamente");
				};

				var fnError = function(sError) {
					var error;
					if (sError.response.body) {
						error = JSON.parse(sError.response.body);
						obj_this.f_MessageErrorDialog(error.error.message.value);
						obj_this.f_close_dialogo_progreso();
					}
				};

				oModel.update(pathAviso, oEntry, null, fnSucess, fnError, false);

			});
		},

		f_modificar_conjunto: function(callback) {
			var list_conjuntos = this.getView().byId("lineItemsList").getItems();

			var modelo_conju = this.getView().byId("lineItemsList").getModel();

			var numero_item = list_conjuntos.length;
			var conjunto;
			var context;
			var path;

			var oEntry = {};

			var i = 0;

			var obj_this = this;

			var fnSucess = function(data, response) {
				var mensaje;
				//obj_this.f_close_dialogo_progreso();
				//obj_this.f_MessageSuccesDialog("Los datos se Guardaron Exitosamente");
			};

			var fnError = function(sError) {
				var error;
				if (sError.response.body) {
					error = JSON.parse(sError.response.body);
					obj_this.f_MessageErrorDialog(error.error.message.value);
					//obj_this.f_close_dialogo_progreso();
				}
			};

			while (i < numero_item) {
				conjunto = list_conjuntos[i];
				context = conjunto.getBindingContext();
				path = context.getPath();
				var oModel = new sap.ui.model.odata.ODataModel(context.getModel().sServiceUrl, true);

				switch (context.getProperty("Opera")) {
					case 'U': //Actualizar
						oEntry.Qmnum = context.getProperty("Qmnum");
						oEntry.Idpos = context.getProperty("Idpos");
						oEntry.Bautl = context.getProperty("Bautl");
						oEntry.Bautx = context.getProperty("Bautx");
						oEntry.Canti =  context.getProperty("Canti");
						oEntry.Otgrp = context.getProperty("Otgrp");
						oEntry.Oteil = context.getProperty("Oteil");
						oEntry.Txtcdot = context.getProperty("Txtcdot");
						oEntry.Fegrp = context.getProperty("Fegrp");
						oEntry.Fecod = context.getProperty("Fecod");
						oEntry.Txtcdfe = context.getProperty("Txtcdfe");
						oEntry.Posnr = (i + 1).toString();
						oEntry.Opera = context.getProperty("Opera");

						oModel.update(path, oEntry, null, fnSucess, fnError, false);
						break;

					case 'D': //Eliminar
						oModel.remove(path, null, fnSucess, fnError, false);
						break;
					default:
				}

				i++;
			}

			callback();
		},

		f_crear_conjunto: function() {

			//Se obtiene el contexto para los datos del Aviso Seleccionado
			var context = this.getView().getBindingContext();

			var oEntry = {};
			var oModel = new sap.ui.model.odata.ODataModel(context.getModel().sServiceUrl, true);

			oEntry.Qmnum = context.getProperty("Qmnum");
			oEntry.Idpos = '0000';

			oEntry.Bautl = sap.ui.getCore().getElementById("cod_material_select").getValue();

			if ((oEntry.Bautl === "")) {
				this.f_MessageErrorDialog("El campo Material es Obligatorio");
				return;
			}			

			oEntry.Bautx = sap.ui.getCore().getElementById("desc_material_select").getText();

			//Se mapea Cantidad
			var cantidad = sap.ui.getCore().getElementById("cantidad_select");
			oEntry.Canti = cantidad.getValue();
			
			if ((oEntry.Canti === "")) {
				this.f_MessageErrorDialog("El campo Cantidad es Obligatorio");
				return;
			}

			//Parte
			oEntry.Otgrp = sap.ui.getCore().getElementById("grup_cod_parte").getText();
			oEntry.Oteil = sap.ui.getCore().getElementById("cod_parte").getText();
			oEntry.Txtcdot = sap.ui.getCore().getElementById("cod_parte_select").getValue();

			if ((oEntry.Txtcdot === "")) {
				this.f_MessageErrorDialog("El campo Parte es Obligatorio");
				return;
			}

			//Sintoma
			oEntry.Fegrp = sap.ui.getCore().getElementById("grup_cod_sintoma").getText();
			oEntry.Fecod = sap.ui.getCore().getElementById("cod_sintoma").getText();
			oEntry.Txtcdfe = sap.ui.getCore().getElementById("cod_sintoma_select").getValue();

			if ((oEntry.Txtcdfe === "")) {
				this.f_MessageErrorDialog("El campo Sintoma es Obligatorio");
				return;
			}
			
			var pos = 2;
			oEntry.Posnr = pos.toString();
			oEntry.Opera = '3';

			//Abrir el mensaje para indicar que los datos se vanb a cargar
			this.f_dialogo_progreso("com.corona.view.fragment.DlgGuardaAviso");

			this._timeout = jQuery.sap.delayedCall(2000, this, function() {
				var obj_this = this;
				var fnSucess = function(data, response) {
					var mensaje;
					obj_this.f_close_dialogo_progreso();
					obj_this.f_MessageSuccesDialog("Los datos se Guardaron Exitosamente");
				};

				var fnError = function(sError) {
					var error;
					if (sError.response.body) {
						error = JSON.parse(sError.response.body);
						obj_this.f_MessageErrorDialog(error.error.message.value);
						obj_this.f_close_dialogo_progreso();
					}
				};

				oModel.create('/ConjuntoSet', oEntry, null, fnSucess, fnError, false);
				
				this.f_close_dialogo_conjunto();
				this.byId("lineItemsList").getBinding("items").filter([]);
			});
		},

		/**
		 * Abrir Dialogo de Error
		 * @function
		 * @public
		 */
		f_MessageErrorDialog: function(sError) {
			var dialog = new Dialog({
				title: 'Error',
				type: 'Message',
				state: 'Error',
				content: new Text({
					text: sError
				}),
				beginButton: new Button({
					text: 'OK',
					press: function() {
						dialog.close();
					}
				}),
				afterClose: function() {
					dialog.destroy();
				}
			});
			dialog.open();
		},

		/**
		 * Abrir Dialogo de Exito
		 * @function
		 * @public
		 */
		f_MessageSuccesDialog: function(sMensaje) {
			var dialog = new Dialog({
				title: 'Success',
				type: 'Message',
				state: 'Success',
				content: new Text({
					text: sMensaje
				}),
				beginButton: new Button({
					text: 'OK',
					press: function() {
						dialog.close();
					}
				}),
				afterClose: function() {
					dialog.destroy();
				}
			});
			dialog.open();
		},

		//Funcion para invocar la ventana de dialogo
		f_dialogo_progreso: function(p_ruta_dialogo) {
			// instantiate dialog
			if (!this.obj_dialogo_progreso) {
				this.obj_dialogo_progreso = sap.ui.xmlfragment(p_ruta_dialogo, this);
				this.getView().addDependent(this.obj_dialogo_progreso);
			}
			// open dialog
			jQuery.sap.syncStyleClass("sapUiSizeCompact", this.getView(), this.obj_dialogo_progreso);
			this.obj_dialogo_progreso.open();
		},

		//Funcion para cerrar la ventada de dialogo cuandos elecciono un cliente
		f_close_dialogo_progreso: function() {
			if (this.obj_dialogo_progreso) {
				this.obj_dialogo_progreso.close();
			}
		},

		f_elimina_conju: function() {
			var oModel_conjunto = this.getView().byId("lineItemsList").getModel();

			//Asignar operación de Eliminar.
			oModel_conjunto.setProperty(this.Path_conjunto + "/Opera", 'D');

			this.f_cancelDialog();
			this.f_close_dialogo_conjunto();
		},

		f_confir_elimina_conjunto: function(oEvent) {
			var mostrar_dlg =  this.f_Dialog_EliminaConjunto("¿Esta seguro que quiere eliminar el registro?");
			if(mostrar_dlg){
				sap.ui.getCore().byId("Dialog1").open();
			}
		},

		//Dialogo al momento de Cerrar la Visita
		f_Dialog_EliminaConjunto: function(p_msj) {

			var list_conjuntos = this.getView().byId("lineItemsList").getItems();
			var numero_item = list_conjuntos.length;

			if (numero_item <= 1) {
				this.f_MessageErrorDialog("Debe existir una posición en la lista de Conjuntos");
				return false;
			}
			
			var list_conjuntos = this.getView().byId("lineItemsList").getItems();
			var num_item = list_conjuntos.length;
			var i= 0;
			var dat_elimi = 0;
			
			var conjunto,
				context;
			while(i < num_item){
				conjunto = list_conjuntos[i];
				context = conjunto.getBindingContext();
				
				if(context.getProperty("Opera") === 'D'){
					dat_elimi = dat_elimi + 1;
				}
				i++;
			}
			
			if (dat_elimi === (num_item -1)) {
				this.f_MessageErrorDialog("Debe existir una posición en la lista de Conjuntos");
				return false;
			}

			var buttonConfirmar = new sap.m.Button("Confirmar_" + Math.floor((Math.random() * 2000) + 1), {
				text: "Si",
				tap: [
					this.f_elimina_conju,
					this
				]
			});
			var buttonCancelar = new sap.m.Button("Cancelar_" + Math.floor((Math.random() * 2000) + 1), {
				text: "No",
				tap: [
					this.f_cancelDialog,
					this
				]
			});
			var msj_Dialog_error = new sap.m.Dialog("Dialog1", {
				title: "Eliminar datos Conjunto",
				type: "Message",
				state: "Warning",
				modal: true,
				buttons: [
					buttonConfirmar,
					buttonCancelar
				],
				content: [new sap.m.Text({
					text: p_msj,
					wrapping: true
				})]
			});
			
			return true;
		},

		f_cancelDialog: function() {
			if (sap.ui.getCore().byId("Dialog1")) {
				sap.ui.getCore().byId("Dialog1").close();
				sap.ui.getCore().byId("Dialog1").destroy();
			}
		}
	});
});