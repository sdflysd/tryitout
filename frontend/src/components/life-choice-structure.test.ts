import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLifeChoiceSubmissionOptions,
  createBlankLifeChoiceOption,
  normalizeLifeChoiceOptions,
  relabelLifeChoiceOptions,
  resolveLifeChoiceCoreFear,
  structureLifeChoiceInput,
} from "./life-choice-structure.js";

test("structureLifeChoiceInput parses existing labeled templates", () => {
  const result = structureLifeChoiceInput(
    "【选项 A】：全身心脱产备考国家公务员，追求长久稳定。\n" +
      "【选项 B】：接受中厂外包开发Offer，月薪9K。\n" +
      "【积蓄情况】：只有3000元，需要向家里要备考生活费\n" +
      "【长辈支持】：父母极其支持考公\n" +
      "【最大恐惧】：害怕脱产两年后一无所有，履历也断掉。",
  );

  assert.equal(result.options.length, 2);
  assert.equal(result.options[0].label, "A");
  assert.equal(result.options[0].title, "全身心脱产备考国家公务员，追求长久稳定。");
  assert.equal(result.options[1].label, "B");
  assert.equal(result.options[1].title, "接受中厂外包开发Offer，月薪9K。");
  assert.equal(result.financialBuffer, "只有3000元，需要向家里要备考生活费");
  assert.equal(result.familySupport, "父母极其支持考公");
  assert.equal(result.coreFear, "害怕脱产两年后一无所有，履历也断掉。");
});

test("structureLifeChoiceInput extracts several natural-language options", () => {
  const result = structureLifeChoiceInput(
    "我现在很纠结：继续留在上海大厂做高级开发，高薪但很累；回老家进事业单位，工资低但稳定；" +
      "也可以先申请一年海外读研；或者请半年假做自由职业试试。最怕选错之后后悔。",
  );

  assert.equal(result.options.length, 4);
  assert.deepEqual(
    result.options.map((option) => option.label),
    ["A", "B", "C", "D"],
  );
  assert.match(result.options[0].title, /继续留在上海大厂/);
  assert.match(result.options[1].title, /回老家进事业单位/);
  assert.match(result.options[2].title, /海外读研/);
  assert.match(result.options[3].title, /自由职业/);
});

test("structureLifeChoiceInput extracts choices from shi A haishi B phrasing", () => {
  const result = structureLifeChoiceInput(
    "在读高三，学习成绩差，很难考上大学，是继续学习还是伺机打工呢",
  );

  assert.equal(result.options.length, 2);
  assert.equal(result.options[0].label, "A");
  assert.match(result.options[0].title, /继续学习/);
  assert.equal(result.options[1].label, "B");
  assert.match(result.options[1].title, /伺机打工/);
});

test("structureLifeChoiceInput caps noisy option lists at four editable groups", () => {
  const result = structureLifeChoiceInput(
    "我可能考研、考公、直接就业、去深圳、回老家、做自由职业，也可能先休息一阵。",
  );

  assert.equal(result.options.length, 4);
  assert.match(result.options[3].title, /其他待合并选择/);
  assert.match(result.options[3].description, /回老家|自由职业|休息/);
});

test("normalizeLifeChoiceOptions keeps labels stable and removes blank rows", () => {
  const normalized = normalizeLifeChoiceOptions([
    { id: "old-a", label: "D", title: "  继续工作  ", description: "" },
    createBlankLifeChoiceOption("temp"),
    { id: "old-b", label: "A", title: "回老家", description: "  家庭支持更强  " },
  ]);

  assert.deepEqual(
    normalized.map((option) => [option.label, option.title, option.description]),
    [
      ["A", "继续工作", ""],
      ["B", "回老家", "家庭支持更强"],
    ],
  );
});

test("relabelLifeChoiceOptions keeps blank editable rows while assigning labels", () => {
  const relabeled = relabelLifeChoiceOptions([
    { id: "old-a", label: "D", title: "继续工作", description: "" },
    createBlankLifeChoiceOption("temp"),
  ]);

  assert.deepEqual(
    relabeled.map((option) => [option.label, option.title]),
    [
      ["A", "继续工作"],
      ["B", ""],
    ],
  );
});

test("buildLifeChoiceSubmissionOptions preserves all choices in compatible A/B fields", () => {
  const { optionA, optionB } = buildLifeChoiceSubmissionOptions([
    { id: "a", label: "A", title: "继续上班", description: "高薪但消耗大" },
    { id: "b", label: "B", title: "回老家体制内", description: "稳定但天花板低" },
    { id: "c", label: "C", title: "先休息三个月", description: "恢复身体再决定" },
  ]);

  assert.equal(optionA, "继续上班 - 高薪但消耗大");
  assert.match(optionB, /^回老家体制内 - 稳定但天花板低/);
  assert.match(optionB, /C. 先休息三个月 - 恢复身体再决定/);
});

test("resolveLifeChoiceCoreFear accepts short natural fears and falls back to context", () => {
  assert.equal(
    resolveLifeChoiceCoreFear(
      "最怕选错之后后悔。",
      "我正在考虑留上海、回老家、读研或自由职业。",
    ),
    "最怕选错之后后悔。",
  );

  assert.match(
    resolveLifeChoiceCoreFear("", "我正在考虑留上海、回老家、读研或自由职业。"),
    /结合原始描述分析：我正在考虑留上海/,
  );
});
