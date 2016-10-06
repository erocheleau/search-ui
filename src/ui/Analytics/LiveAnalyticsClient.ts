import {IAnalyticsClient} from './AnalyticsClient';
import {DeviceUtils} from '../../utils/DeviceUtils';
import {PendingSearchEvent} from './PendingSearchEvent';
import {PendingSearchAsYouTypeSearchEvent} from './PendingSearchAsYouTypeSearchEvent';
import {AnalyticsEndpoint} from '../../rest/AnalyticsEndpoint';
import {Assert} from '../../misc/Assert';
import {Logger} from '../../misc/Logger';
import {IAnalyticsActionCause, analyticsActionCauseList} from './AnalyticsActionListMeta';
import {IQueryResult} from '../../rest/QueryResult';
import {ITopQueries} from '../../rest/TopQueries';
import {IChangeableAnalyticsMetaObject, IChangeableAnalyticsDataObject, IChangeAnalyticsCustomDataEventArgs} from '../../events/AnalyticsEvents';
import {Defer} from '../../misc/Defer';
import {$$} from '../../utils/Dom';
import {AnalyticsEvents, IAnalyticsCustomEventArgs} from '../../events/AnalyticsEvents';
import {APIAnalyticsBuilder} from '../../rest/APIAnalyticsBuilder';
import {IAnalyticsEvent} from '../../rest/AnalyticsEvent';
import {ISearchEvent} from '../../rest/SearchEvent';
import {IClickEvent} from '../../rest/ClickEvent';
import {ICustomEvent} from '../../rest/CustomEvent';
import {QueryStateModel} from '../../models/QueryStateModel';
import {Component} from '../Base/Component';
import {version} from '../../misc/Version';

export class LiveAnalyticsClient implements IAnalyticsClient {
  public isContextual: boolean = false;
  private language = <string>String['locale'];
  private device = DeviceUtils.getDeviceName();
  private mobile = DeviceUtils.isMobileDevice();
  private pendingSearchEvent: PendingSearchEvent;
  private pendingSearchAsYouTypeSearchEvent: PendingSearchAsYouTypeSearchEvent;
  private logger: Logger;

  constructor(public endpoint: AnalyticsEndpoint, public rootElement: HTMLElement, public userId: string, public userDisplayName: string, public anonymous: boolean, public splitTestRunName: string, public splitTestRunVersion: string, public originLevel1: string, public sendToCloud: boolean) {

    Assert.exists(endpoint);
    Assert.exists(rootElement);
    Assert.isNonEmptyString(this.language);
    Assert.isNonEmptyString(this.device);
    Assert.isNonEmptyString(this.originLevel1);
    this.logger = new Logger(this);
  }

  public isActivated(): boolean {
    return true;
  }

  public getCurrentVisitId(): string {
    return this.endpoint.getCurrentVisitId();
  }

  public getCurrentVisitIdPromise(): Promise<string> {
    return this.endpoint.getCurrentVisitIdPromise();
  }

  public getCurrentEventCause() {
    if (this.pendingSearchEvent != null) {
      return this.pendingSearchEvent.getEventCause();
    }
    if (this.pendingSearchAsYouTypeSearchEvent != null) {
      return this.pendingSearchAsYouTypeSearchEvent.getEventCause();
    }
    return null;
  }

  public getCurrentEventMeta() {
    if (this.pendingSearchEvent != null) {
      return this.pendingSearchEvent.getEventMeta();
    }
    if (this.pendingSearchAsYouTypeSearchEvent != null) {
      return this.pendingSearchAsYouTypeSearchEvent.getEventMeta();
    }
    return null;
  }

  public logSearchEvent<TMeta>(actionCause: IAnalyticsActionCause, meta: TMeta) {
    var metaObject = this.buildMetaObject(meta);
    this.pushSearchEvent(actionCause, metaObject);
  }

  public logSearchAsYouType<TMeta>(actionCause: IAnalyticsActionCause, meta?: TMeta) {
    var metaObject = this.buildMetaObject(meta);
    this.pushSearchAsYouTypeEvent(actionCause, metaObject);
  }

  public logClickEvent<TMeta>(actionCause: IAnalyticsActionCause, meta: TMeta, result: IQueryResult, element: HTMLElement) {
    var metaObject = this.buildMetaObject(meta);
    this.pushClickEvent(actionCause, metaObject, result, element);
  }

  public logCustomEvent<TMeta>(actionCause: IAnalyticsActionCause, meta: TMeta, element: HTMLElement) {
    var metaObject = this.buildMetaObject(meta);
    this.pushCustomEvent(actionCause, metaObject, element);
  }

  public getTopQueries(params: ITopQueries): Promise<string[]> {
    return this.endpoint.getTopQueries(params);
  }

  public sendAllPendingEvents() {
    if (this.pendingSearchAsYouTypeSearchEvent) {
      this.pendingSearchAsYouTypeSearchEvent.sendRightNow();
    }
  }

  public cancelAllPendingEvents() {
    if (this.pendingSearchAsYouTypeSearchEvent) {
      this.pendingSearchAsYouTypeSearchEvent.cancel();
      this.pendingSearchAsYouTypeSearchEvent = null;
    }
    if (this.pendingSearchEvent) {
      this.pendingSearchEvent.cancel();
      this.pendingSearchEvent = null;
    }
  }

  public getPendingSearchEvent(): PendingSearchEvent {
    if (this.pendingSearchEvent) {
      return this.pendingSearchEvent;
    } else if (this.pendingSearchAsYouTypeSearchEvent) {
      return this.pendingSearchAsYouTypeSearchEvent;
    }
    return null;
  }

  public warnAboutSearchEvent() {
    if (_.isUndefined(this.pendingSearchEvent) && _.isUndefined(this.pendingSearchAsYouTypeSearchEvent)) {
      this.logger.warn('A search was triggered, but no analytics event was logged. If you wish to have consistent analytics data, consider logging a search event using the methods provided by the framework', 'https://developers.coveo.com/x/TwA5');
      if (window['console'] && console.trace) {
        console.trace();
      }
    }
  }

  private pushCustomEvent(actionCause: IAnalyticsActionCause, metaObject: IChangeableAnalyticsMetaObject, element?: HTMLElement) {
    var customEvent = this.buildCustomEvent(actionCause, metaObject, element);
    this.triggerChangeAnalyticsCustomData('CustomEvent', metaObject, customEvent);
    this.checkToSendAnyPendingSearchAsYouType(actionCause);
    Defer.defer(() => {
      if (this.sendToCloud) {
        this.endpoint.sendCustomEvent(customEvent);
      }
      $$(this.rootElement).trigger(AnalyticsEvents.customEvent, <IAnalyticsCustomEventArgs>{ customEvent: APIAnalyticsBuilder.convertCustomEventToAPI(customEvent) });
    });
  }

  private pushSearchEvent(actionCause: IAnalyticsActionCause, metaObject: IChangeableAnalyticsMetaObject) {
    Assert.exists(actionCause);
    if (this.pendingSearchEvent && this.pendingSearchEvent.getEventCause() !== actionCause.name) {
      this.pendingSearchEvent.stopRecording();
      this.pendingSearchEvent = null;
    }
    this.checkToSendAnyPendingSearchAsYouType(actionCause);

    if (!this.pendingSearchEvent) {
      var searchEvent = this.buildSearchEvent(actionCause, metaObject);
      this.triggerChangeAnalyticsCustomData('SearchEvent', metaObject, searchEvent);
      var pendingSearchEvent = this.pendingSearchEvent = new PendingSearchEvent(this.rootElement, this.endpoint, searchEvent, this.sendToCloud);

      Defer.defer(() => {
        // At this point all `duringQuery` events should have been fired, so we can forget
        // about the pending search event. It will finish processing automatically when
        // all the deferred that were caught terminate.
        this.pendingSearchEvent = undefined;
        pendingSearchEvent.stopRecording();
      });
    }
  }

  private checkToSendAnyPendingSearchAsYouType(actionCause: IAnalyticsActionCause) {
    if (this.eventIsNotRelatedToSearchbox(actionCause.name)) {
      this.sendAllPendingEvents();
    } else {
      this.cancelAnyPendingSearchAsYouTypeEvent();
    }
  }

  private pushSearchAsYouTypeEvent(actionCause: IAnalyticsActionCause, metaObject: IChangeableAnalyticsMetaObject) {
    this.cancelAnyPendingSearchAsYouTypeEvent();
    var searchEvent = this.buildSearchEvent(actionCause, metaObject);
    this.triggerChangeAnalyticsCustomData('SearchEvent', metaObject, searchEvent);
    this.pendingSearchAsYouTypeSearchEvent = new PendingSearchAsYouTypeSearchEvent(this.rootElement, this.endpoint, searchEvent, this.sendToCloud);
  }

  private pushClickEvent(actionCause: IAnalyticsActionCause, metaObject: IChangeableAnalyticsMetaObject, result: IQueryResult, element: HTMLElement) {
    var event = this.buildClickEvent(actionCause, metaObject, result, element);
    this.checkToSendAnyPendingSearchAsYouType(actionCause);
    this.triggerChangeAnalyticsCustomData('ClickEvent', metaObject, event, { resultData: result });
    Assert.isNonEmptyString(event.searchQueryUid);
    Assert.isNonEmptyString(event.collectionName);
    Assert.isNonEmptyString(event.sourceName);
    Assert.isNumber(event.documentPosition);
    Defer.defer(() => {
      if (this.sendToCloud) {
        this.endpoint.sendDocumentViewEvent(event);
      }
      $$(this.rootElement).trigger(AnalyticsEvents.documentViewEvent, {
        documentViewEvent: APIAnalyticsBuilder.convertDocumentViewToAPI(event)
      });
    });
  }

  private buildAnalyticsEvent(actionCause: IAnalyticsActionCause, metaObject: IChangeableAnalyticsMetaObject): IAnalyticsEvent {
    return {
      actionCause: actionCause.name,
      actionType: actionCause.type,
      username: this.userId,
      userDisplayName: this.userDisplayName,
      anonymous: this.anonymous,
      device: this.device,
      mobile: this.mobile,
      language: this.language,
      responseTime: undefined,
      originLevel1: this.originLevel1,
      originLevel2: this.getOriginLevel2(this.rootElement),
      originLevel3: document.referrer,
      customData: _.keys(metaObject).length > 0 ? metaObject : undefined,
      userAgent: navigator.userAgent
    };
  }

  private buildSearchEvent(actionCause: IAnalyticsActionCause, metaObject: IChangeableAnalyticsMetaObject): ISearchEvent {
    return this.merge<ISearchEvent>(this.buildAnalyticsEvent(actionCause, metaObject), {
      searchQueryUid: undefined,
      pipeline: undefined,
      splitTestRunName: this.splitTestRunName,
      splitTestRunVersion: this.splitTestRunVersion,
      queryText: undefined,
      advancedQuery: undefined,
      results: undefined,
      resultsPerPage: undefined,
      pageNumber: undefined,
      didYouMean: undefined,
      facets: undefined,
      contextual: this.isContextual
    });
  }

  private buildClickEvent(actionCause: IAnalyticsActionCause, metaObject: IChangeableAnalyticsMetaObject, result: IQueryResult, element: HTMLElement): IClickEvent {
    return this.merge<IClickEvent>(this.buildAnalyticsEvent(actionCause, metaObject), {
      searchQueryUid: result.queryUid,
      queryPipeline: result.pipeline,
      splitTestRunName: this.splitTestRunName || result.splitTestRun,
      splitTestRunVersion: this.splitTestRunVersion || (result.splitTestRun != undefined ? result.pipeline : undefined),
      documentUri: result.uri,
      documentUriHash: result.raw['urihash'],
      documentUrl: result.clickUri,
      documentTitle: result.title,
      documentCategory: result.raw['objecttype'],
      originLevel2: this.getOriginLevel2(element),
      collectionName: <string>result.raw['collection'],
      sourceName: <string>result.raw['source'],
      documentPosition: result.index + 1,
      responseTime: 0,
      viewMethod: actionCause.name,
      rankingModifier: result.rankingModifier
    });
  }

  private buildCustomEvent(actionCause: IAnalyticsActionCause, metaObject: IChangeableAnalyticsMetaObject, element: HTMLElement): ICustomEvent {
    return this.merge<ICustomEvent>(this.buildAnalyticsEvent(actionCause, metaObject), {
      eventType: actionCause.type,
      eventValue: actionCause.name,
      originLevel2: this.getOriginLevel2(element),
      responseTime: 0
    });
  }

  protected getOriginLevel2(element: HTMLElement): string {
    return this.resolveActiveTabFromElement(element) || 'default';
  }

  private buildMetaObject<TMeta>(meta: TMeta): IChangeableAnalyticsMetaObject {
    var build: IChangeableAnalyticsMetaObject = _.extend({}, meta);
    build['JSUIVersion'] = version.lib + ';' + version.product;
    return build;
  }

  private cancelAnyPendingSearchAsYouTypeEvent() {
    if (this.pendingSearchAsYouTypeSearchEvent) {
      this.pendingSearchAsYouTypeSearchEvent.cancel();
      this.pendingSearchAsYouTypeSearchEvent = undefined;
    }
  }

  private resolveActiveTabFromElement(element: HTMLElement): string {
    Assert.exists(element);
    var queryStateModel = this.resolveQueryStateModel(element);
    return (queryStateModel && <string>queryStateModel.get(QueryStateModel.attributesEnum.t));
  }

  private resolveQueryStateModel(rootElement: HTMLElement): QueryStateModel {
    return <QueryStateModel>Component.resolveBinding(rootElement, QueryStateModel);
  }

  private eventIsNotRelatedToSearchbox(event: string) {
    return event !== analyticsActionCauseList.searchboxSubmit.name && event !== analyticsActionCauseList.searchboxClear.name;
  }

  private triggerChangeAnalyticsCustomData(type: string, metaObject: IChangeableAnalyticsMetaObject, event: IAnalyticsEvent, data?: any) {
    // This is for backward compatibility. Before the analytics were using either numbered
    // metas in `metaDataAsNumber` of later on named metas in `metaDataAsString`. Thus we still
    // provide those properties in a deprecated way. Below we are moving any data that put
    // in them to the root.
    (<any>metaObject)['metaDataAsString'] = {};
    (<any>metaObject)['metaDataAsNumber'] = {};

    var changeableAnalyticsDataObject: IChangeableAnalyticsDataObject = {
      language: event.language,
      originLevel1: event.originLevel1,
      originLevel2: event.originLevel2,
      originLevel3: event.originLevel3,
      metaObject: metaObject
    };


    var args: IChangeAnalyticsCustomDataEventArgs = _.extend({}, {
      type: type,
      actionType: event.actionType,
      actionCause: event.actionCause
    }, changeableAnalyticsDataObject, data);
    $$(this.rootElement).trigger(AnalyticsEvents.changeAnalyticsCustomData, args);

    event.language = args.language;
    event.originLevel1 = args.originLevel1;
    event.originLevel2 = args.originLevel2;
    event.originLevel3 = args.originLevel3;
    event.customData = metaObject;

    // This is for backward compatibility. Before the analytics were using either numbered
    // metas in `metaDataAsNumber` of later on named metas in `metaDataAsString`. We are now putting
    // them all at the root, and if I encounter the older properties I move them to the top
    // level after issuing a warning.

    var metaDataAsString = event.customData['metaDataAsString'];
    if (_.keys(metaDataAsString).length > 0) {
      this.logger.warn('Using deprecated \'metaDataAsString\' key to log custom analytics data. Custom meta should now be put at the root of the object.');
      _.extend(event.customData, metaDataAsString);
    }
    delete event.customData['metaDataAsString'];

    var metaDataAsNumber = event.customData['metaDataAsNumber'];
    if (_.keys(metaDataAsNumber).length > 0) {
      this.logger.warn('Using deprecated \'metaDataAsNumber\' key to log custom analytics data. Custom meta should now be put at the root of the object.');
      _.extend(event.customData, metaDataAsNumber);
    }
    delete event.customData['metaDataAsNumber'];
  }

  private merge<T extends IAnalyticsEvent>(first: IAnalyticsEvent, second: any): T {
    return _.extend({}, first, second);
  }
}
