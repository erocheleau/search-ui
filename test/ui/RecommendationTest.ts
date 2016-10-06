import * as Mock from '../MockEnvironment';
import {SearchInterface} from '../../src/ui/SearchInterface/SearchInterface';
import {Recommendation} from '../../src/ui/Recommendation/Recommendation';
import {IRecommendationOptions} from '../../src/ui/Recommendation/Recommendation';
import {IQuery} from '../../src/rest/Query';
import {Simulate} from '../Simulate';
import {QueryBuilder} from '../../src/ui/Base/QueryBuilder';
import {FakeResults} from '../Fake';

export function RecommendationTest() {
  describe('Recommendation', () => {
    let mainSearchInterface: Mock.IBasicComponentSetup<SearchInterface>;
    let test: Mock.IBasicComponentSetup<Recommendation>;
    let options: IRecommendationOptions;
    let actionsHistory = [1, 2, 3];
    let userId = '123';
    let store: CoveoAnalytics.HistoryStore;

    beforeEach(() => {
      mainSearchInterface = Mock.basicSearchInterfaceSetup(SearchInterface);
      options = {
        mainSearchInterface: mainSearchInterface.env.root,
        userContext: JSON.stringify({
          user_id: userId
        })
      };
      store = {
        addElement: (query: IQuery) => { },
        getHistory: () => { return actionsHistory; },
        setHistory: (history: any[]) => { },
        clear: () => { }
      };
      test = Mock.optionsSearchInterfaceSetup<Recommendation, IRecommendationOptions>(Recommendation, options);
      Mock.initPageViewScript(store);
    });

    afterEach(() => {
      mainSearchInterface = null;
      options = null;
      test = null;
      window['coveoanalytics'] = undefined;
    });

    it('should work if mainInterface is not specified', () => {
      let optionsWithNoMainInterface: IRecommendationOptions = {
        mainSearchInterface: null
      };

      expect(() => {
        new Recommendation(document.createElement('div'), optionsWithNoMainInterface);
      }).not.toThrow();
    });

    it('should work if coveoanalytics is not specified', () => {
      window['coveoanalytics'] = undefined;
      test = Mock.optionsSearchInterfaceSetup<Recommendation, IRecommendationOptions>(Recommendation, options);
      let simulation = Simulate.query(test.env);
      expect(simulation.queryBuilder.actionsHistory).toEqual('[]');
    });

    it('should not modify the query if it was not triggered by the mainInterface', () => {
      let queryBuilder: QueryBuilder = new QueryBuilder();
      let query = 'test';
      queryBuilder.expression.add(query);
      let simulation = Simulate.query(test.env, {
        queryBuilder: queryBuilder
      });
      expect(simulation.queryBuilder.expression.build()).toEqual('test');
    });

    it('should generate a different id by default for each recommendation component', () => {
      let secondRecommendation = Mock.basicSearchInterfaceSetup<Recommendation>(Recommendation);
      expect(test.cmp.options.id).not.toEqual(secondRecommendation.cmp.options.id);
    });

    describe('when the mainInterface triggered a query', () => {

      it('should trigger a query', () => {
        Simulate.query(mainSearchInterface.env);
        expect(test.cmp.queryController.executeQuery).toHaveBeenCalled();
      });

      it('should send the recommendation id', () => {
        test.cmp.options.id = 'test';
        let simulation = Simulate.query(test.env);
        expect(simulation.queryBuilder.recommendation).toEqual('test');
      });

      it('should only copy the optionsToUse', () => {

        _.extend(options, { optionsToUse: ['expression'] });
        test = Mock.optionsSearchInterfaceSetup<Recommendation, IRecommendationOptions>(Recommendation, options);

        let queryBuilder: QueryBuilder = new QueryBuilder();
        let query = 'test';
        let advandcedQuery = '@field=test';
        queryBuilder.expression.add(query);
        queryBuilder.advancedExpression.add(advandcedQuery);

        Simulate.query(mainSearchInterface.env, {
          queryBuilder: queryBuilder
        });

        let simulation = Simulate.query(test.env);
        expect(simulation.queryBuilder.expression).toEqual(queryBuilder.expression);
        expect(simulation.queryBuilder.advancedExpression).not.toEqual(queryBuilder.advancedExpression);
      });

      it('should add the userContext in the triggered query', () => {
        let simulation = Simulate.query(test.env);
        expect(simulation.queryBuilder.context['user_id']).toEqual(userId);
      });

      it('should not add the userContext in the triggered query if userContext was not specified', () => {
        options = {
          mainSearchInterface: mainSearchInterface.env.root
        };
        test = Mock.optionsSearchInterfaceSetup<Recommendation, IRecommendationOptions>(Recommendation, options);
        let simulation = Simulate.query(test.env);
        expect(simulation.queryBuilder.context).toBeUndefined();
      });

      describe('exposes option sendActionHistory', () => {
        it('should add the actionsHistory in the triggered query', () => {
          let simulation = Simulate.query(test.env);
          expect(simulation.queryBuilder.actionsHistory).toEqual(JSON.stringify(actionsHistory));
        });

        it('should add the actionsHistory even if the user context is not specified', () => {
          options = {
            mainSearchInterface: mainSearchInterface.env.root
          };
          test = Mock.optionsSearchInterfaceSetup<Recommendation, IRecommendationOptions>(Recommendation, options);
          let simulation = Simulate.query(test.env);
          expect(simulation.queryBuilder.actionsHistory).toEqual(JSON.stringify(actionsHistory));
        });

        it('should not send the actionsHistory if false', () => {
          options.sendActionsHistory = false;
          test = Mock.optionsSearchInterfaceSetup<Recommendation, IRecommendationOptions>(Recommendation, options);
          let simulation = Simulate.query(test.env);
          expect(simulation.queryBuilder.actionsHistory).toBeUndefined();
        });
      });

      describe('exposes option hideIfNoResults', () => {
        it('should hide the interface if there are no recommendations and the option is true', () => {
          options.hideIfNoResults = true;
          test = Mock.optionsSearchInterfaceSetup<Recommendation, IRecommendationOptions>(Recommendation, options);
          Simulate.query(test.env, { results: FakeResults.createFakeResults(0) });
          expect(test.cmp.element.style.display).toEqual('none');
        });

        it('should not hide the interface if there are no recommendations and the option is false', () => {
          options.hideIfNoResults = false;
          test = Mock.optionsSearchInterfaceSetup<Recommendation, IRecommendationOptions>(Recommendation, options);
          Simulate.query(test.env, { results: FakeResults.createFakeResults(0) });
          expect(test.cmp.element.style.display).toEqual('block');
        });

        it('should show the interface if there are recommendations', () => {
          Simulate.query(test.env);
          expect(test.cmp.element.style.display).not.toEqual('none');
        });
      });

      it('should hide on query error', () => {
        Simulate.query(test.env, { error: { message: 'oh noes', type: 'bad', name: 'foobar' } });
        expect(test.cmp.element.style.display).toEqual('none');
      });
    });
  });
}
