import * as Mock from '../MockEnvironment';
import {SearchEndpoint} from '../../src/rest/SearchEndpoint';
import {$$} from '../../src/utils/Dom';
import {Querybox} from '../../src/ui/Querybox/Querybox';
import {Component} from '../../src/ui/Base/Component';
import {Initialization} from '../../src/ui/Base/Initialization';
import {Facet} from '../../src/ui/Facet/Facet';
import {Pager} from '../../src/ui/Pager/Pager';
declare var coveoanalytics;

export function InitializationTest() {
  describe('Initialization', function () {
    var root: HTMLElement;
    var endpoint: SearchEndpoint;
    var searchInterfaceOptions: {};
    var queryBox: HTMLElement;

    beforeEach(function () {
      root = document.createElement('div');
      $$(root).addClass('CoveoSearchInterface');
      endpoint = Mock.mockSearchEndpoint();
      endpoint.options = {};
      searchInterfaceOptions = { SearchInterface: { endpoint: endpoint } };
      queryBox = document.createElement('div');
      $$(queryBox).addClass('CoveoQuerybox');
      root.appendChild(queryBox);
    });

    afterEach(function () {
      root = null;
      endpoint = null;
      searchInterfaceOptions = null;
      queryBox = null;
    });

    it('can initialize search interface and component', function () {

      expect(Component.get(queryBox) instanceof Querybox).toBe(false);
      Initialization.initializeFramework(root, searchInterfaceOptions, () => {
        Initialization.initSearchInterface(root, searchInterfaceOptions);
      });
      expect(Component.get(queryBox) instanceof Querybox).toBe(true);
    });

    it('should not initialize a search interface twice', function () {
      expect(Component.get(queryBox) instanceof Querybox).toBe(false);
      Initialization.initializeFramework(root, searchInterfaceOptions, () => {
        Initialization.initSearchInterface(root, searchInterfaceOptions);
      });
      expect(Component.get(queryBox) instanceof Querybox).toBe(true);


      let newQueryBox = document.createElement('div');
      $$(newQueryBox).addClass('CoveoQuerybox');
      root.appendChild(newQueryBox);
      expect(Component.get(newQueryBox) instanceof Querybox).toBe(false);
      Initialization.initializeFramework(root, searchInterfaceOptions, () => {
        Initialization.initSearchInterface(root, searchInterfaceOptions);
      });
      expect(Component.get(newQueryBox) instanceof Querybox).toBe(false);
    });

    it('allows to register default options ahead of init call, and merge them', function () {
      Initialization.registerDefaultOptions(root, {
        Querybox: {
          enableSearchAsYouType: true
        }
      });
      Initialization.registerDefaultOptions(root, {
        Querybox: {
          enablePartialMatch: true
        }
      });

      expect(Component.get(queryBox) instanceof Querybox).toBe(false);
      Initialization.initializeFramework(root, searchInterfaceOptions, () => {
        Initialization.initSearchInterface(root, searchInterfaceOptions);
      });
      expect(Component.get(queryBox) instanceof Querybox).toBe(true);
      var sBox = <Querybox>Component.get(queryBox);
      expect(sBox.options.enableSearchAsYouType).toBe(true);
      expect(sBox.options.enablePartialMatch).toBe(true);
    });

    it('allows to registerAutoCreateComponent', function () {
      var dummyCmp: any = jasmine.createSpy('foobar');
      dummyCmp.ID = 'FooBar';
      var dummyElem = document.createElement('div');
      $$(dummyElem).addClass('CoveoFooBar');
      root.appendChild(dummyElem);

      Initialization.registerAutoCreateComponent(dummyCmp);
      Initialization.initializeFramework(root, searchInterfaceOptions, () => {
        Initialization.initSearchInterface(root, searchInterfaceOptions);
      });
      expect(dummyCmp).toHaveBeenCalled();
    });

    it('allows to check if isComponentClassIdRegistered', function () {
      var dummyCmp: any = () => {
      };
      dummyCmp.ID = 'CheckRegistration';
      Initialization.registerAutoCreateComponent(dummyCmp);
      expect(Initialization.isComponentClassIdRegistered('CheckRegistration')).toBe(true);
    });

    it('allow to getListOfRegisteredComponents', function () {
      expect(Initialization.getListOfRegisteredComponents()).toEqual(jasmine.arrayContaining(['Facet', 'Pager']));
    });

    it('allow to getRegisteredComponent', function () {
      expect(Initialization.getRegisteredComponent('Facet')).toBe(Facet);
    });

    it('allow to automaticallyCreateComponentsInside', function () {
      var env = new Mock.MockEnvironmentBuilder().build();
      expect(Component.get(queryBox) instanceof Querybox).toBe(false);
      Initialization.automaticallyCreateComponentsInside(root, {
        options: {},
        bindings: env
      });
      expect(Component.get(queryBox) instanceof Querybox).toBe(true);
    });

    it('allow to monkeyPatchComponentMethod', function () {
      Initialization.initializeFramework(root, searchInterfaceOptions, () => {
        Initialization.initSearchInterface(root, searchInterfaceOptions);
      });
      var patch = jasmine.createSpy('patch');
      Initialization.monkeyPatchComponentMethod('submit', queryBox, patch);
      (<Querybox>Component.get(queryBox)).submit();
      expect(patch).toHaveBeenCalled();
    });

    it('can initialize external components', function () {
      var external = $$('div', {
        className: 'CoveoPager'
      }).el;

      searchInterfaceOptions['externalComponents'] = [external];
      Initialization.initializeFramework(root, searchInterfaceOptions, () => {
        Initialization.initSearchInterface(root, searchInterfaceOptions);
      });
      expect(Component.get(external) instanceof Pager).toBe(true);
    });

    describe('when initializing recommendation interface', function () {
      var options;
      beforeEach(function () {
        options = {
          Recommendation: {
            endpoint: endpoint,
            mainSearchInterface: root,
            userContext: {}
          },
          SearchInterface: {}
        };
        Mock.initPageViewScript(null);
      });

      afterEach(function () {
        options = null;
        coveoanalytics = undefined;
      });

      it('should be able to generate to components', function () {
        expect(Component.get(queryBox) instanceof Querybox).toBe(false);
        Initialization.initRecommendationInterface(root, options);
        expect(Component.get(queryBox) instanceof Querybox).toBe(true);
      });
    });
  });
}
