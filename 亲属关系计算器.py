#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
亲属关系计算器（书面称谓版）

特点：
1. 只输出通用书面称谓和结构称谓，不包含地方方言或日常口语。
2. 常用关系精确命中，直系、堂表亲、养继亲属和配偶延伸关系支持生成式推导。
3. 任意长度的合法关系链都会返回结果；没有稳定书面专名时返回结构称谓。

命令行示例：
    python3 亲属关系计算器.py "父亲的哥哥的妻子"
    python3 亲属关系计算器.py "父-兄-子" --age older
    python3 亲属关系计算器.py "母-姐-女" --age younger
    python3 亲属关系计算器.py "妻-父-兄-子"
    python3 亲属关系计算器.py --interactive
    python3 亲属关系计算器.py --self-test

作为模块调用：
    from importlib.machinery import SourceFileLoader
    kc = SourceFileLoader("kc", "亲属关系计算器.py").load_module()
    result = kc.calculate("父-母-兄-子", age="unknown")
    print(result.title)

注意：关系链按“从我开始、逐步走到目标亲属”解释，默认不回走、不重复经过同一节点。
例如“父-子”可能指自己，也可能指兄弟，仅靠链条无法唯一确定，因此只给结构描述。
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import unittest
from dataclasses import asdict, dataclass
from typing import Dict, Iterable, List, Optional, Sequence, Tuple


Path = Tuple[str, ...]

PARENTS = {"父", "母", "养父", "养母", "继父", "继母"}
BIO_PARENTS = {"父", "母"}
CHILDREN = {"子", "女", "养子", "养女", "继子", "继女"}
BIO_CHILDREN = {"子", "女"}
SIBLINGS = {"兄", "弟", "姐", "妹"}
MALE_SIBLINGS = {"兄", "弟"}
SPOUSES = {"夫", "妻"}

RELATION_LABELS = {
    "父": "父亲", "母": "母亲", "夫": "丈夫", "妻": "妻子",
    "兄": "哥哥", "弟": "弟弟", "姐": "姐姐", "妹": "妹妹",
    "子": "儿子", "女": "女儿",
    "养父": "养父", "养母": "养母", "继父": "继父", "继母": "继母",
    "养兄": "养兄", "养弟": "养弟", "养姐": "养姐", "养妹": "养妹",
    "继兄": "继兄", "继弟": "继弟", "继姐": "继姐", "继妹": "继妹",
    "养子": "养子", "养女": "养女", "继子": "继子", "继女": "继女",
}

ALIASES = {
    "父": "父", "父亲": "父", "f": "父",
    "母": "母", "母亲": "母", "m": "母",
    "夫": "夫", "丈夫": "夫", "h": "夫",
    "妻": "妻", "妻子": "妻", "w": "妻",
    "兄": "兄", "哥哥": "兄", "ob": "兄",
    "弟": "弟", "弟弟": "弟", "yb": "弟",
    "姐": "姐", "姐姐": "姐", "os": "姐",
    "妹": "妹", "妹妹": "妹", "ys": "妹",
    "子": "子", "儿子": "子", "s": "子",
    "女": "女", "女儿": "女", "d": "女",
    "养父": "养父", "养母": "养母", "养兄": "养兄", "养弟": "养弟",
    "养姐": "养姐", "养妹": "养妹", "养子": "养子", "养女": "养女",
    "继父": "继父", "继母": "继母", "继兄": "继兄", "继弟": "继弟",
    "继姐": "继姐", "继妹": "继妹", "继子": "继子", "继女": "继女",
}


@dataclass(frozen=True)
class Rule:
    title: str
    note: str = ""


@dataclass
class Result:
    path: str
    structural: str
    title: str
    category: str
    method: str
    confidence: str
    note: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


RULES: Dict[Path, Rule] = {}


def add(paths: Iterable[Path], title: str, note: str = "") -> None:
    for path in paths:
        RULES[tuple(path)] = Rule(title, note)


# 核心家庭成员
add([("父",)], "父亲")
add([("母",)], "母亲")
add([("夫",)], "丈夫")
add([("妻",)], "妻子")
add([("兄",)], "兄")
add([("弟",)], "弟")
add([("姐",)], "姐")
add([("妹",)], "妹")
add([("子",)], "儿子")
add([("女",)], "女儿")

# 祖辈
add([("父", "父")], "祖父")
add([("父", "母")], "祖母")
add([("母", "父")], "外祖父")
add([("母", "母")], "外祖母")

# 伯叔姑舅姨及其配偶
add([("父", "兄")], "伯父")
add([("父", "弟")], "叔父")
add([("父", "姐"), ("父", "妹")], "姑母")
add([("母", "兄"), ("母", "弟")], "舅父")
add([("母", "姐"), ("母", "妹")], "姨母")
add([("父", "兄", "妻")], "伯母")
add([("父", "弟", "妻")], "叔母（婶母）")
add([("父", "姐", "夫"), ("父", "妹", "夫")], "姑父")
add([("母", "兄", "妻"), ("母", "弟", "妻")], "舅母")
add([("母", "姐", "夫"), ("母", "妹", "夫")], "姨父")

# 兄弟姐妹的配偶
add([("兄", "妻")], "嫂子")
add([("弟", "妻")], "弟媳")
add([("姐", "夫")], "姐夫")
add([("妹", "夫")], "妹夫")

# 侄甥及其配偶
add([("兄", "子"), ("弟", "子")], "侄子")
add([("兄", "女"), ("弟", "女")], "侄女")
add([("姐", "子"), ("妹", "子")], "外甥")
add([("姐", "女"), ("妹", "女")], "外甥女")
add([("兄", "子", "妻"), ("弟", "子", "妻")], "侄媳")
add([("兄", "女", "夫"), ("弟", "女", "夫")], "侄女婿")
add([("姐", "子", "妻"), ("妹", "子", "妻")], "外甥媳")
add([("姐", "女", "夫"), ("妹", "女", "夫")], "外甥女婿")

# 子女及孙辈的配偶
add([("子", "妻")], "儿媳")
add([("女", "夫")], "女婿")
add([("子", "子", "妻")], "孙媳")
add([("子", "女", "夫")], "孙女婿")
add([("女", "子", "妻")], "外孙媳")
add([("女", "女", "夫")], "外孙女婿")

# 配偶的父母与兄弟姐妹
add([("夫", "父")], "夫父（公公）")
add([("夫", "母")], "夫母（婆婆）")
add([("妻", "父")], "岳父")
add([("妻", "母")], "岳母")
add([("夫", "兄")], "夫兄")
add([("夫", "弟")], "夫弟")
add([("夫", "姐")], "夫姐")
add([("夫", "妹")], "夫妹")
add([("妻", "兄")], "内兄")
add([("妻", "弟")], "内弟")
add([("妻", "姐")], "内姐")
add([("妻", "妹")], "内妹")
add([("夫", "兄", "妻")], "夫嫂", "与本人构成妯娌关系。")
add([("夫", "弟", "妻")], "夫弟媳", "与本人构成妯娌关系。")
add([("妻", "兄", "妻")], "内嫂")
add([("妻", "弟", "妻")], "内弟媳")
add([("妻", "姐", "夫")], "襟兄", "与本人构成连襟关系。")
add([("妻", "妹", "夫")], "襟弟", "与本人构成连襟关系。")

# 祖辈的兄弟姐妹及其配偶（父系常用书面规则）
add([("父", "父", "兄")], "伯祖父")
add([("父", "父", "弟")], "叔祖父")
add([("父", "父", "姐"), ("父", "父", "妹")], "姑祖母")
add([("父", "母", "兄"), ("父", "母", "弟")], "舅祖父")
add([("父", "母", "姐"), ("父", "母", "妹")], "姨祖母")
add([("父", "父", "兄", "妻")], "伯祖母")
add([("父", "父", "弟", "妻")], "叔祖母")
add([("父", "父", "姐", "夫"), ("父", "父", "妹", "夫")], "姑祖父")
add([("父", "母", "兄", "妻"), ("父", "母", "弟", "妻")], "舅祖母")
add([("父", "母", "姐", "夫"), ("父", "母", "妹", "夫")], "姨祖父")

# 亲家
add([("子", "妻", "父"), ("女", "夫", "父")], "亲家公")
add([("子", "妻", "母"), ("女", "夫", "母")], "亲家母")

# 养亲、继亲的直接关系
add([("养父",)], "养父")
add([("养母",)], "养母")
add([("继父",)], "继父")
add([("继母",)], "继母")
add([("养子",)], "养子")
add([("养女",)], "养女")
add([("继子",)], "继子")
add([("继女",)], "继女")
for prefix in ("养", "继"):
    add([(prefix + "兄",)], prefix + "兄")
    add([(prefix + "弟",)], prefix + "弟")
    add([(prefix + "姐",)], prefix + "姐")
    add([(prefix + "妹",)], prefix + "妹")
add([("养子", "妻")], "养儿媳")
add([("养女", "夫")], "养女婿")
add([("继子", "妻")], "继儿媳")
add([("继女", "夫")], "继女婿")


UPWARD_STEMS = {
    2: "祖父", 3: "曾祖父", 4: "高祖父", 5: "天祖父",
    6: "烈祖父", 7: "太祖父", 8: "远祖父", 9: "鼻祖",
}
DOWNWARD_STEMS = {
    2: "孙", 3: "曾孙", 4: "玄孙", 5: "来孙",
    6: "晜孙", 7: "仍孙", 8: "云孙", 9: "耳孙",
}


def parse_path(text: str) -> Path:
    """把“父亲的母亲的哥哥”或“父-母-兄”解析为规范关系链。"""
    text = text.strip()
    if not text:
        raise ValueError("关系链不能为空。")
    text = re.sub(r"^我(?:的)?", "", text)
    tokens = [t for t in re.split(r"(?:的|->|>|-|/|\\|，|,|；|;|\s)+", text) if t]
    if not tokens:
        raise ValueError("没有识别到关系，请输入例如“父-母-兄”。")
    result: List[str] = []
    unknown: List[str] = []
    for token in tokens:
        key = token.strip().lower()
        if key in ALIASES:
            result.append(ALIASES[key])
        else:
            unknown.append(token)
    if unknown:
        supported = "、".join(RELATION_LABELS)
        raise ValueError(
            "无法识别：" + "、".join(unknown) +
            "。请用“的”或“-”分隔单步关系；支持：" + supported
        )
    return tuple(result)


def structural(path: Path) -> str:
    return "我的" + "的".join(RELATION_LABELS[p] for p in path)


def classify(path: Path) -> str:
    has_adopt = any(p.startswith("养") for p in path)
    has_step = any(p.startswith("继") for p in path)
    has_spouse = any(p in SPOUSES for p in path)
    if has_adopt and has_step:
        return "养继混合亲属"
    if has_adopt:
        return "养亲" + ("／姻亲" if has_spouse else "")
    if has_step:
        return "继亲" + ("／姻亲" if has_spouse else "")
    if has_spouse:
        return "配偶" if len(path) == 1 else "姻亲"
    return "血亲"


def base_parent(p: str) -> str:
    return "父" if p.endswith("父") else "母"


def base_child(p: str) -> str:
    return "子" if p.endswith("子") else "女"


def qualifier(path: Path) -> str:
    has_adopt = any(p.startswith("养") for p in path)
    has_step = any(p.startswith("继") for p in path)
    if has_adopt and has_step:
        return "养继"
    if has_adopt:
        return "养"
    if has_step:
        return "继"
    return ""


def gender_of_last(path: Path) -> str:
    last = path[-1]
    if last in {"父", "夫", "兄", "弟", "子", "养父", "继父", "养兄", "继兄", "养弟", "继弟", "养子", "继子"}:
        return "male"
    return "female"


def sibling_name(prefix: str, gender: str, age: str) -> str:
    """生成堂、表、养、继等平辈书面称谓；年龄未知时不擅自确定长幼。"""
    if gender == "male":
        if age == "older":
            return prefix + "兄"
        if age == "younger":
            return prefix + "弟"
        return prefix + "兄弟"
    if age == "older":
        return prefix + "姐"
    if age == "younger":
        return prefix + "妹"
    return prefix + "姐妹"


def lineal_up(path: Path) -> Optional[Result]:
    if len(path) < 2 or not all(p in PARENTS for p in path):
        return None
    n = len(path)
    q = qualifier(path)
    male = gender_of_last(path) == "male"
    maternal = base_parent(path[0]) == "母"
    outer = "外" if maternal else ""
    line = "母系" if maternal else "父系"
    if n in UPWARD_STEMS:
        stem = UPWARD_STEMS[n]
        if male:
            title = q + outer + stem
        else:
            title = q + outer + ("鼻祖（女性）" if stem == "鼻祖" else stem[:-1] + "母")
        note = "高世代称谓以书面结构为准。"
        if q:
            note = q + "亲复合链条保留亲属标识，以避免与血亲混淆。"
        return Result("-".join(path), structural(path), title, classify(path), f"直系生成：连续上溯{n}代，{line}", "generative", note)
    title = f"{q}{line}上溯{n}代直系祖先（{'男性' if male else '女性'}）"
    return Result(
        "-".join(path), structural(path), title, classify(path),
        f"直系生成：连续上溯{n}代", "generative",
        "超出传统九代常用专名，使用代际结构称谓。",
    )


def lineal_down(path: Path) -> Optional[Result]:
    if len(path) < 2 or not all(p in CHILDREN for p in path):
        return None
    n = len(path)
    q = qualifier(path)
    female = gender_of_last(path) == "female"
    maternal = base_child(path[0]) == "女"
    outer = "外" if maternal else ""
    if n in DOWNWARD_STEMS:
        title = q + outer + DOWNWARD_STEMS[n] + ("女" if female else "")
        note = "高世代称谓主要用于书面表达。"
        if q:
            note = q + "亲复合链条保留亲属标识，以避免与血亲混淆。"
        return Result("-".join(path), structural(path), title, classify(path), f"直系生成：连续下延{n}代", "generative", note)
    title = f"{q}{'女儿' if maternal else '儿子'}支下延{n}代直系后裔（{'女性' if female else '男性'}）"
    return Result(
        "-".join(path), structural(path), title, classify(path),
        f"直系生成：连续下延{n}代", "generative",
        "超出传统九代常用专名，使用代际结构称谓。",
    )


def cousin(path: Path, age: str) -> Optional[Result]:
    """识别 父/母…＋兄弟姐妹＋子/女… 的堂表亲链条。"""
    if not path or path[0] not in BIO_PARENTS:
        return None
    split = next((i for i, p in enumerate(path) if p in SIBLINGS), None)
    if split is None or split < 1:
        return None
    up = path[:split]
    down = path[split + 1:]
    if not down or not all(p in BIO_PARENTS for p in up) or not all(p in BIO_CHILDREN for p in down):
        return None
    a, b = len(up), len(down)
    sibling = path[split]
    gender = gender_of_last(path)
    # 堂亲看父系男线，但目标本人可以是女性，所以不检查 down 的最后一步。
    agnatic = all(p == "父" for p in up) and sibling in MALE_SIBLINGS and all(p == "子" for p in down[:-1])
    branch = "堂" if agnatic else "表"
    if a != b:
        diff = abs(a - b)
        seniority = "长" if a > b else "晚"
        title = f"隔代{branch}亲（目标比本人{seniority}{diff}辈，{'男' if gender == 'male' else '女'}性）"
        return Result(
            "-".join(path), structural(path), title, "血亲",
            "堂表亲生成：共同祖先两侧代数不同", "generative",
            "隔代堂表亲保留代际结构，不强行套用表叔、表舅等称谓。",
        )
    degree = a
    if degree == 1:
        prefix = branch
        if branch == "表":
            if up[0] == "父":
                prefix = "姑表"
            elif sibling in MALE_SIBLINGS:
                prefix = "舅表"
            else:
                prefix = "姨表"
        title = sibling_name(prefix, gender, age)
        note = "长幼未知时保留“兄弟／姐妹”；确定长幼后才能精确到兄、弟、姐、妹。" if age == "unknown" else ""
        return Result("-".join(path), structural(path), title, "血亲", "堂表亲生成：第一代堂表亲", "generative", note)
    title = sibling_name("远房" + branch, gender, age)
    return Result(
        "-".join(path), structural(path), f"第{degree}代{branch}亲：" + title,
        "血亲", f"堂表亲生成：共同祖先两侧各延伸{a}代", "generative",
        "“第几代堂表亲”是程序用于精确说明代际的书面表述。",
    )


def qualified_sibling(path: Path, age: str) -> Optional[Result]:
    """养父/养母/继父/继母的子女，生成养兄弟、继姐妹等。"""
    if len(path) != 2 or path[0] not in {"养父", "养母", "继父", "继母"} or path[1] not in BIO_CHILDREN:
        return None
    q = qualifier(path)
    title = sibling_name(q, gender_of_last(path), age)
    return Result(
        "-".join(path), structural(path), title, classify(path),
        "养继生成：养/继父母的子女", "generative",
        "这是亲属结构推导，不替代对具体法律关系的判断。",
    )


def spouse_extension(path: Path, age: str, depth: int) -> Optional[Result]:
    """配偶的延伸亲属：先计算配偶一侧，再组合书面称谓。"""
    if len(path) < 2 or path[0] not in SPOUSES:
        return None
    sub = _calculate(path[1:], age, depth + 1)
    spouse_word = "丈夫" if path[0] == "夫" else "妻子"
    return Result(
        "-".join(path), structural(path), f"{spouse_word}的{sub.title}",
        "姻亲", "姻亲生成：配偶一侧关系递归", "generative",
        "保留完整结构以明确亲属链路。",
    )


def spouse_of_relative(path: Path, age: str, depth: int) -> Optional[Result]:
    """任意已知亲属的配偶，生成复合书面称谓。"""
    if len(path) < 2 or path[-1] not in SPOUSES:
        return None
    sub = _calculate(path[:-1], age, depth + 1)
    word = "丈夫" if path[-1] == "夫" else "妻子"
    return Result(
        "-".join(path), structural(path), f"{sub.title}的{word}",
        classify(path), "姻亲生成：亲属＋配偶", "generative",
        "没有统一书面专名时保留结构称谓。",
    )


def fallback(path: Path) -> Result:
    return Result(
        "-".join(path), structural(path), "结构称谓：" + structural(path),
        classify(path), "任意链结构推导", "structural",
        "该关系可以准确描述，但没有足够稳定的统一书面专名。",
    )


def _calculate(path: Path, age: str = "unknown", depth: int = 0) -> Result:
    if not path:
        raise ValueError("关系链不能为空。")
    if depth > 10000:
        raise ValueError("关系链递归过深。")
    if path in RULES:
        rule = RULES[path]
        return Result("-".join(path), structural(path), rule.title, classify(path), "常用关系精确规则", "exact", rule.note)
    for generator in (lineal_up, lineal_down):
        result = generator(path)
        if result:
            return result
    result = qualified_sibling(path, age)
    if result:
        return result
    result = cousin(path, age)
    if result:
        return result
    result = spouse_extension(path, age, depth)
    if result:
        return result
    result = spouse_of_relative(path, age, depth)
    if result:
        return result
    return fallback(path)


def calculate(text_or_path, age: str = "unknown") -> Result:
    """对外主函数。接受字符串或关系元组；age 为 older、younger、unknown。"""
    if age not in {"older", "younger", "unknown"}:
        raise ValueError("age 只能是 older、younger 或 unknown。")
    path = parse_path(text_or_path) if isinstance(text_or_path, str) else tuple(text_or_path)
    invalid = [p for p in path if p not in RELATION_LABELS]
    if invalid:
        raise ValueError("存在不支持的关系代码：" + "、".join(invalid))
    return _calculate(path, age)


def format_result(result: Result) -> str:
    lines = [
        f"关系链：{result.path}",
        f"结构：{result.structural}",
        f"书面称谓：{result.title}",
        f"类别：{result.category}",
        f"推导方式：{result.method}",
        f"结果级别：{ {'exact': '常用精确规则', 'generative': '生成式规则', 'structural': '结构描述'}[result.confidence] }",
    ]
    if result.note:
        lines.append("说明：" + result.note)
    return "\n".join(lines)


class KinshipTests(unittest.TestCase):
    def check(self, path: str, expected: str, age: str = "unknown") -> None:
        self.assertEqual(calculate(path, age).title, expected, path)

    def test_exact(self) -> None:
        self.check("父亲的父亲", "祖父")
        self.check("母-母", "外祖母")
        self.check("父-兄-妻", "伯母")
        self.check("兄-子", "侄子")
        self.check("姐-女", "外甥女")
        self.check("妻-兄", "内兄")
        self.check("夫-弟", "夫弟")
        self.check("子-妻-父", "亲家公")
        self.check("养父", "养父")

    def test_cousins(self) -> None:
        self.check("父-兄-子", "堂兄", "older")
        self.check("父-弟-女", "堂妹", "younger")
        self.check("父-兄-女", "堂姐", "older")
        self.check("母-姐-女", "姨表姐妹")
        self.check("父-姐-子", "姑表兄弟")
        self.check("母-兄-子", "舅表兄", "older")

    def test_lineal(self) -> None:
        self.check("父-父-父-父", "高祖父")
        self.check("母-母-母", "外曾祖母")
        self.check("子-子-子-子", "玄孙")
        self.check("女-女-女", "外曾孙女")
        self.check("养父-父", "养祖父")
        self.check("继母-母", "继外祖母")

    def test_step_and_deep(self) -> None:
        self.check("继父-子", "继兄", "older")
        self.check("父-父-兄-子-子", "第2代堂亲：远房堂兄", "older")
        self.assertIn("上溯10代", calculate("父-" * 9 + "父").title)
        self.assertEqual(calculate("父-母-兄-子-女-夫").confidence, "generative")

    def test_parse_and_fallback(self) -> None:
        self.assertEqual(parse_path("父亲的母亲"), ("父", "母"))
        self.assertEqual(parse_path("F > M > OB"), ("父", "母", "兄"))
        self.assertEqual(calculate("父-子").confidence, "structural")
        with self.assertRaises(ValueError):
            parse_path("父亲的小姨子")


def self_test() -> bool:
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(KinshipTests)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    return result.wasSuccessful()


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="亲属关系计算器：只输出书面称谓，支持任意长关系链与生成式推导")
    parser.add_argument("path", nargs="?", help="如：父亲的哥哥的妻子，或 父-兄-妻")
    parser.add_argument("--age", choices=["older", "younger", "unknown"], default="unknown", help="目标平辈相对年龄；默认 unknown")
    parser.add_argument("--json", action="store_true", help="以 JSON 输出")
    parser.add_argument("--interactive", action="store_true", help="连续查询，输入 q 退出")
    parser.add_argument("--self-test", action="store_true", help="运行内置测试")
    args = parser.parse_args(argv)

    if args.self_test:
        return 0 if self_test() else 1
    if args.interactive:
        print("输入书面关系链，如“父亲的哥哥的妻子”；输入 q 退出。")
        while True:
            try:
                text = input("关系> ").strip()
            except (EOFError, KeyboardInterrupt):
                print()
                break
            if text.lower() in {"q", "quit", "exit", "退出"}:
                break
            if not text:
                continue
            try:
                print(format_result(calculate(text, args.age)))
                print()
            except ValueError as exc:
                print("错误：" + str(exc))
        return 0
    if not args.path:
        parser.print_help()
        return 2
    try:
        result = calculate(args.path, args.age)
    except ValueError as exc:
        print("错误：" + str(exc), file=sys.stderr)
        return 2
    if args.json:
        print(json.dumps(result.to_dict(), ensure_ascii=False, indent=2))
    else:
        print(format_result(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
