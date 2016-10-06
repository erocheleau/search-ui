import {AdvancedFieldInput} from '../../../../src/ui/AdvancedSearch/DocumentInput/AdvancedFieldInput';

export function AdvancedFieldInputTest() {
  describe('AdvancedFieldInput', () => {
    let input: AdvancedFieldInput;
    let fieldName: string;
    let value: string;

    beforeEach(function () {
      value = 'what';
      fieldName = '@test';
      input = new AdvancedFieldInput('test', fieldName);
      input.build();
      input.input.setValue(value);
    });

    afterEach(function () {
      input = null;
      fieldName = null;
      value = null;
    });

    describe('getValue', () => {
      it('if contains, should return fieldName = value', () => {
        input.mode.selectValue('Contains');
        expect(input.getValue()).toEqual(fieldName + '=' + value);
      });

      it('if does not contains, should return fieldName <> value', () => {
        input.mode.selectValue('DoesNotContain');
        expect(input.getValue()).toEqual(fieldName + '<>' + value);
      });

      it('if matches, should return fieldName == "value"', () => {
        input.mode.selectValue('Matches');
        expect(input.getValue()).toEqual(fieldName + '=="' + value + '"');
      });
    });
  });
}
