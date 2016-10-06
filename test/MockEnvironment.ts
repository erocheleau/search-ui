import {IComponentBindings} from '../src/ui/Base/ComponentBindings';
import {IQueryResult} from '../src/rest/QueryResult';
import {SearchInterface} from '../src/ui/SearchInterface/SearchInterface';
import {QueryStateModel} from '../src/models/QueryStateModel';
import {IAnalyticsClient} from '../src/ui/Analytics/AnalyticsClient';
import {$$} from '../src/utils/Dom';
import {ComponentStateModel} from '../src/models/ComponentStateModel';
import {ComponentOptionsModel} from '../src/models/ComponentOptionsModel';
import {OS_NAME} from '../src/utils/OSUtils';
import {FakeResults} from './Fake';
import {Component} from '../src/ui/Base/Component';
import {Utils} from '../src/utils/Utils';
import {BaseComponent} from '../src/ui/Base/BaseComponent';
import {IQuery} from '../src/rest/Query';
import {NoopAnalyticsClient} from '../src/ui/Analytics/NoopAnalyticsClient';
import {SearchEndpoint} from '../src/rest/SearchEndpoint';
import {QueryController} from '../src/controllers/QueryController';
declare var coveoanalytics: CoveoAnalytics.CoveoUA;

export interface IMockEnvironment extends IComponentBindings {
  root: HTMLElement;
  element: HTMLElement;
  result: IQueryResult;
  searchEndpoint: SearchEndpoint;
  searchInterface: SearchInterface;
  queryController: QueryController;
  queryStateModel: QueryStateModel;
  usageAnalytics: IAnalyticsClient;
}

export interface IMockEnvironmentWithData<T> extends IMockEnvironment {
  data: T;
}

export class MockEnvironmentBuilder {
  public root: HTMLElement = $$('div').el;
  public element: HTMLElement = $$('div').el;
  public result: IQueryResult = undefined;
  public searchEndpoint = mockSearchEndpoint();
  public searchInterface = mockSearchInterface();
  public queryController = mockQueryController();
  public queryStateModel = mockComponent<QueryStateModel>(QueryStateModel, QueryStateModel.ID);
  public componentStateModel = mockComponent<ComponentStateModel>(ComponentStateModel, ComponentStateModel.ID);
  public usageAnalytics = mockUsageAnalytics();
  public componentOptionsModel = mockComponent<ComponentOptionsModel>(ComponentOptionsModel, ComponentOptionsModel.ID);
  public os: OS_NAME;
  private built = false;

  public withRoot(root: HTMLElement) {
    this.root = root ? root : this.root;
    return this;
  }

  public withElement(element: HTMLElement) {
    this.element = element ? element : this.element;
    return this;
  }

  public withLiveQueryStateModel() {
    this.queryStateModel = new QueryStateModel(this.root);
    return this;
  }

  public withQueryStateModel(model: QueryStateModel) {
    this.queryStateModel = model;
    return this;
  }

  public withOldDesign() {
    this.searchInterface.isNewDesign = () => false;
    return this;
  }

  public withCollaborativeRating() {
    this.searchInterface.options.enableCollaborativeRating = true;
    return this;
  }

  public withOs(os: OS_NAME) {
    this.os = os;
    return this;
  }

  public withResult(result: IQueryResult = FakeResults.createFakeResult()): MockEnvironmentBuilder {
    this.result = result;
    return this;
  }

  public withEndpoint(endpoint: SearchEndpoint = mockSearchEndpoint()): MockEnvironmentBuilder {
    this.searchEndpoint = endpoint;
    return this;
  }

  public build(): IMockEnvironment {
    if (this.built) {
      return this.getBindings();
    }
    if (this.element.parentNode == undefined) {
      this.root.appendChild(this.element);
    }

    Component.bindComponentToElement(this.root, this.searchInterface);
    Component.bindComponentToElement(this.root, this.queryController);
    Component.bindComponentToElement(this.root, this.queryStateModel);
    Component.bindComponentToElement(this.root, this.componentStateModel);
    Component.bindComponentToElement(this.root, this.componentOptionsModel);

    this.searchInterface.queryController = this.queryController;
    this.searchInterface.queryStateModel = this.queryStateModel;
    this.searchInterface.componentStateModel = this.componentStateModel;
    this.searchInterface.componentOptionsModel = this.componentOptionsModel;

    this.queryController.getEndpoint = () => this.searchEndpoint;

    if (Utils.isNullOrUndefined(this.searchInterface.isNewDesign())) {
      this.searchInterface.isNewDesign = () => true;
    }


    if (this.result) {
      Component.bindResultToElement(this.element, this.result);
    }
    this.built = true;
    return this.getBindings();
  }

  public getBindings(): IMockEnvironment {
    if (!this.built) {
      return this.build();
    }
    return {
      root: this.root,
      element: this.element,
      result: this.result,
      searchEndpoint: this.searchEndpoint,
      searchInterface: this.searchInterface,
      queryController: this.queryController,
      queryStateModel: this.queryStateModel,
      usageAnalytics: this.usageAnalytics,
      componentStateModel: this.componentStateModel,
      componentOptionsModel: this.componentOptionsModel
    };
  }
}

export interface IBasicComponentSetup<T extends BaseComponent> {
  env: IMockEnvironment;
  cmp: T;
}

export class AdvancedComponentSetupOptions {

  constructor(public element: HTMLElement = $$('div').el, public cmpOptions: any = {}, public modifyBuilder = (env: MockEnvironmentBuilder) => {
    return env;
  }) {
  }

  public merge(toMerge: AdvancedComponentSetupOptions) {
    if (toMerge) {
      this.element = toMerge.element ? toMerge.element : this.element;
      this.cmpOptions = toMerge.cmpOptions ? toMerge.cmpOptions : this.cmpOptions;
      this.modifyBuilder = toMerge.modifyBuilder ? toMerge.modifyBuilder : this.modifyBuilder;
    }
    return this;
  }
}

export function mock<T>(contructorFunc, name = 'mock'): T {
  var keys = [];
  for (var key in contructorFunc.prototype) {
    keys.push(key);
  }
  return keys.length > 0 ? jasmine.createSpyObj(name, keys) : {};
}

export function mockWindow(): Window {
  var mockWindow = <Window>mock(window);
  mockWindow.location = <Location>{
    'href': '',
    'hash': ''
  };
  mockWindow.location.replace = (newHref: string) => {
    newHref = newHref || '';

    mockWindow.location.href = newHref;

    // 'http://www.coveo.com/#foo' => 'foo'
    // 'http://www.coveo.com/#' => ''
    // 'http://www.coveo.com/' => ''
    mockWindow.location.hash = newHref.substring(newHref.indexOf('#') + 1);

    // 'foo' => '#foo'
    // '' => ''
    if (mockWindow.location.hash != '') {
      mockWindow.location.hash = '#' + mockWindow.location.hash;
    }
  };
  mockWindow.addEventListener = jasmine.createSpy('addEventListener');
  mockWindow.removeEventListener = jasmine.createSpy('removeEventListener');
  mockWindow.dispatchEvent = jasmine.createSpy('dispatchEvent');
  return mockWindow;
}

export function mockComponent<T extends BaseComponent>(constructorFunc, name = 'mock'): T {
  var m = mock<T>(constructorFunc, name);
  m.type = name;
  return m;
}

export function mockSearchInterface(): SearchInterface {
  var m = mockComponent<SearchInterface>(SearchInterface, SearchInterface.ID);
  m.options = {};
  m.options.originalOptionsObject = {};
  return m;
}

export function mockQueryController(): QueryController {
  var m = mockComponent<QueryController>(QueryController, QueryController.ID);
  var spy = <any>m;
  spy.options = {};
  spy.options.resultsPerPage = 10;
  spy.fetchMore.and.returnValue(new Promise((resolve, reject) => { }));
  return m;
}

export function mockSearchEndpoint(): SearchEndpoint {
  var m = mock<any>(SearchEndpoint, 'SearchEndpoint');
  m.listFields.and.returnValue(new Promise((resolve, reject) => {
  }));
  m.listFieldValues.and.returnValue(new Promise((resolve, reject) => {
  }));
  m.search.and.returnValue(new Promise((resolve, reject) => {
  }));
  m.getRevealQuerySuggest.and.returnValue(new Promise((resolve, reject) => {
  }));
  m.extensions.and.returnValue(new Promise((resolve, reject) => {
  }));
  m.getViewAsDatastreamUri.and.returnValue('http://datastream.uri');
  return m;
}

export function mockUsageAnalytics(): IAnalyticsClient {
  var m = mock<any>(NoopAnalyticsClient, 'AnalyticsClient');
  m.getTopQueries.and.returnValue(new Promise((resolve, reject) => {
  }));
  return m;
}

export function basicComponentSetup<T>(klass, options = {}) {
  var envBuilder = new MockEnvironmentBuilder();
  return {
    env: envBuilder.build(),
    cmp: <T>new klass(envBuilder.getBindings().element, options, envBuilder.getBindings())
  };
}

export function basicResultComponentSetup<T>(klass) {
  var envBuilder = new MockEnvironmentBuilder().withResult();
  return {
    env: envBuilder.build(),
    cmp: <T>new klass(envBuilder.getBindings().element, {}, envBuilder.getBindings(), envBuilder.result)
  };
}

export function basicSearchInterfaceSetup<T extends SearchInterface>(klass) {
  var div = $$('div').el;
  var envBuilder = new MockEnvironmentBuilder().withRoot(div);
  var component = <T>new klass(div);
  envBuilder.searchInterface = component;
  return {
    env: envBuilder.build(),
    cmp: component
  };
}

export function optionsSearchInterfaceSetup<T extends SearchInterface, U>(klass, options: U) {
  var div = $$('div').el;
  var envBuilder = new MockEnvironmentBuilder().withRoot(div);
  var component = <T>new klass(div, options);
  envBuilder.searchInterface = component;
  return {
    env: envBuilder.build(),
    cmp: component
  };
}

export function optionsResultComponentSetup<T, U>(klass, options: U, result: IQueryResult) {
  var envBuilder = new MockEnvironmentBuilder().withResult(result);
  return {
    env: envBuilder.build(),
    cmp: <T>new klass(envBuilder.getBindings().element, options, envBuilder.getBindings(), envBuilder.result)
  };
}

export function optionsComponentSetup<T, U>(klass, options: U) {
  var envBuilder = new MockEnvironmentBuilder();
  return {
    env: envBuilder.build(),
    cmp: <T>new klass(envBuilder.getBindings().element, options, envBuilder.getBindings())
  };
}

export function advancedComponentSetup<T>(klass, options?: AdvancedComponentSetupOptions) {
  var baseOptions = new AdvancedComponentSetupOptions();
  var optsMerged = baseOptions.merge(options);

  var envBuilder = new MockEnvironmentBuilder().withElement(optsMerged.element);
  envBuilder = optsMerged.modifyBuilder(envBuilder);
  return {
    env: envBuilder.build(),
    cmp: <T>new klass(envBuilder.getBindings().element, optsMerged.cmpOptions, envBuilder.getBindings())
  };
}

export function advancedResultComponentSetup<T>(klass, result: IQueryResult, options?: AdvancedComponentSetupOptions) {
  var baseOptions = new AdvancedComponentSetupOptions();
  var optsMerged = baseOptions.merge(options);

  var envBuilder = new MockEnvironmentBuilder().withElement(optsMerged.element).withResult(result);
  envBuilder = optsMerged.modifyBuilder(envBuilder);
  return {
    env: envBuilder.build(),
    cmp: <T>new klass(envBuilder.getBindings().element, optsMerged.cmpOptions, envBuilder.getBindings(), envBuilder.result, envBuilder.os)
  };
}

export function initPageViewScript(store: CoveoAnalytics.HistoryStore) {
  class HistoryStoreMock {
    constructor() {
    }

    public addElement(query: IQuery) {
      store.addElement(query);
    }

    public getHistory() {
      return store.getHistory();
    }

    public setHistory(history: any[]) {
      store.setHistory(history);
    }

    public clear() {
      store.clear();
    }
  }

  window['coveoanalytics'] = {
    history: {
      HistoryStore: HistoryStoreMock
    }
  };
}
